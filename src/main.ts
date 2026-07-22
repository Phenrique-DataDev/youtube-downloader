/**
 * Entrada do app.
 *
 * Ordem deliberada (SC-1 x SC-7): sobe o servidor e abre o browser PRIMEIRO,
 * e so entao cuida das dependencias — em paralelo. A UI aparece em segundos
 * mesmo quando o bootstrap vai demorar; o botao fica desabilitado com aviso
 * ate o cache ficar pronto (AT-003).
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdir, appendFile } from 'node:fs/promises';
import { validarUrlYoutube } from './core/url.ts';
import { resolverCaminhos } from './bootstrap/paths.ts';
import {
  garantirYtdlp,
  atualizarYtdlpEmSegundoPlano,
  type EstadoBootstrap,
} from './bootstrap/deps.ts';
import { garantirFfmpeg } from './bootstrap/ffmpeg.ts';
import { sondar } from './ytdlp/probe.ts';
import { baixar } from './ytdlp/downloader.ts';
import { encerrarTodosOsProcessos } from './ytdlp/runner.ts';
import { iniciarServidor } from './server/http.ts';
import { caminhoEstaConfinado } from './server/guards.ts';
import { detectarModo, deveAbrirNavegador, sondarInstancia } from './lifecycle/instancia.ts';
import { esconderConsole, avisarFalhaFatal } from './lifecycle/console.ts';
import { autostartLigado, alternarAutostart } from './lifecycle/autostart.ts';

const PORTA_PREFERIDA = 47821;

const caminhos = resolverCaminhos();
let estado: EstadoBootstrap = { fase: 'verificando' };

async function principal(): Promise<void> {
  const modo = detectarModo(process.argv);

  // Antes de qualquer coisa: ja existe instancia nossa viva? Subir um segundo
  // servidor aqui e o que fazia a maquina acumular processos invisiveis.
  const quem = await sondarInstancia(PORTA_PREFERIDA);

  if (quem === 'nossa') {
    await registrar('arranque', `modo=${modo} decisao=ceder`);
    // Cede o lugar — mas quem clicou no atalho pediu para usar o app AGORA, e
    // sair calado faria o duplo-clique parecer quebrado (desvio do AT-101,
    // registrado no DESIGN).
    if (deveAbrirNavegador(modo)) abrirNoBrowser(`http://127.0.0.1:${PORTA_PREFERIDA}/`);
    process.exit(0);
  }

  if (quem === 'terceiro') {
    // Nao e nosso: `escutar` vai cair no fallback de porta, e o link salvo
    // desta pessoa nao aponta para ca. A UI avisa (via `enderecoEstavel`).
    await registrar('arranque', `modo=${modo} decisao=porta-alternativa`);
  }

  const raizUi = join(dirname(fileURLToPath(import.meta.url)), 'ui');

  const servidor = await iniciarServidor(
    raizUi,
    {
      estadoBootstrap: () => estado,

      encerrar: () => void encerrar(),

      autostart: {
        ler: () => autostartLigado(),
        // `process.execPath` e o proprio `.exe` empacotado em producao. Em
        // desenvolvimento aponta para o node, e ligar o autostart nao faria
        // sentido — mas tambem nao quebra: quem roda `npm run dev` nao usa
        // este botao.
        alternar: (desejado: boolean) => alternarAutostart(desejado, process.execPath),
      },

      sondar: async (url: string) => {
        // Camada 1: validacao local. Nenhum subprocesso e disparado se a URL
        // nao passar daqui (AT-005).
        const validacao = validarUrlYoutube(url);
        if (!validacao.ok) {
          return {
            ok: false,
            erro: { mensagem: validacao.mensagem, detalhe: '', temporario: false },
          };
        }

        if (estado.fase !== 'pronto') {
          return {
            ok: false,
            erro: {
              mensagem: 'Ainda estou preparando as dependências.',
              detalhe: '',
              temporario: true,
            },
          };
        }

        const resultado = await sondar(caminhos.ytdlp, validacao.urlCanonica, caminhos.ffmpegDir);
        if (!resultado.ok) await registrar('sonda falhou', resultado.erro.detalhe);
        return resultado;
      },

      baixar: async (corpo, emitir, sinal) => {
        const pedido = corpo as {
          url?: unknown;
          formato?: unknown;
          alturaPreferida?: unknown;
          codecAudio?: unknown;
        };

        const validacao = validarUrlYoutube(String(pedido.url ?? ''));
        if (!validacao.ok) {
          return {
            ok: false,
            erro: { mensagem: validacao.mensagem, detalhe: '', temporario: false },
          };
        }

        if (estado.fase !== 'pronto') {
          return {
            ok: false,
            erro: {
              mensagem: 'Ainda estou preparando as dependências.',
              detalhe: '',
              temporario: true,
            },
          };
        }

        const formato = pedido.formato === 'audio' ? 'audio' : 'video';
        const altura =
          typeof pedido.alturaPreferida === 'number' && pedido.alturaPreferida > 0
            ? pedido.alturaPreferida
            : undefined;
        // Allowlist, nao cast: o valor vira argumento de linha de comando, e
        // qualquer string que passasse daqui iria parar no `--audio-format`.
        const codecAudio = pedido.codecAudio === 'm4a' ? 'm4a' : 'mp3';

        // O destino nao vem do pedido: e sempre a raiz de downloads resolvida
        // localmente. Nao ha o que confinar na ENTRADA — conferir `destino`
        // contra ele mesmo seria tautologia, e tautologia que parece guarda e
        // pior que guarda nenhuma (ver a verificacao de SAIDA abaixo).
        const destino = resolve(caminhos.downloads);

        const inicio = Date.now();
        const resultado = await baixar(
          caminhos.ytdlp,
          {
            urlCanonica: validacao.urlCanonica,
            formato,
            ...(altura !== undefined ? { alturaPreferida: altura } : {}),
            codecAudio,
            destino,
            ffmpegDir: caminhos.ffmpegDir,
          },
          {
            aoProgredir: (evento) => emitir('progresso', evento),
            sinal,
          },
        );

        if (resultado.ok) {
          // AQUI o confinamento tem conteudo: `caminhoArquivo` e reportado pelo
          // yt-dlp — processo externo, com o titulo do video no nome. A UI
          // exibe esse caminho, entao ele precisa mesmo ter caido dentro da
          // raiz que pedimos, e nao em outro lugar do disco.
          if (!caminhoEstaConfinado(resolve(resultado.caminhoArquivo), destino)) {
            await registrar('caminho fora da raiz', resultado.caminhoArquivo);
            return {
              ok: false,
              erro: {
                mensagem: 'O arquivo foi salvo fora da pasta de downloads.',
                detalhe: '',
                temporario: false,
              },
            };
          }
          await registrar('download ok', `${Date.now() - inicio}ms ${resultado.caminhoArquivo}`);
        } else {
          // stderr bruto vai para o log, nunca para a UI.
          await registrar('download falhou', resultado.erro.detalhe);
        }
        return resultado;
      },
    },
    PORTA_PREFERIDA,
  );

  await registrar(
    'arranque',
    `modo=${modo} decisao=subir porta=${servidor.porta} estavel=${servidor.enderecoEstavel}`,
  );

  console.log(`Servindo em ${servidor.url}`);

  // SO AGORA a janela some. Antes daqui qualquer falha ainda precisa de um
  // lugar para aparecer — depois daqui, `console.log` nao vai a lugar nenhum
  // (ver o cabecalho de lifecycle/console.ts).
  const escondeu = await esconderConsole();
  await registrar('console', escondeu ? 'liberado' : 'permanece visivel');

  if (deveAbrirNavegador(modo)) abrirNoBrowser(servidor.url);

  // Bootstrap em paralelo — a UI ja esta no ar neste ponto.
  prepararDependencias().catch(async (erro: unknown) => {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    estado = { fase: 'falhou', mensagem };
    await registrar('bootstrap falhou', mensagem);
  });

  const encerrar = async () => {
    // AT-011: nenhum processo filho sobrevive ao app.
    encerrarTodosOsProcessos();
    await servidor.fechar();
    process.exit(0);
  };

  process.on('SIGINT', () => void encerrar());
  process.on('SIGTERM', () => void encerrar());
}

async function prepararDependencias(): Promise<void> {
  estado = { fase: 'verificando' };

  await garantirYtdlp({
    caminhos,
    aoMudarEstado: (novo) => {
      estado = novo;
    },
  });

  // Depois do yt-dlp, nao em paralelo: sao ~106 MB e disputar banda atrasaria
  // os dois. `garantirFfmpeg` e no-op quando o cache ja esta quente, entao isto
  // so custa na primeira execucao.
  await garantirFfmpeg({
    caminhos,
    aoMudarEstado: (novo) => {
      estado = novo;
    },
  });

  estado = { fase: 'pronto' };

  // Atualizacao NAO bloqueia: roda depois de a UI ja estar utilizavel.
  const atualizou = await atualizarYtdlpEmSegundoPlano(caminhos);
  await registrar('update yt-dlp', atualizou ? 'ok' : 'sem alteracao ou falhou');
}

/** Observabilidade local: log em arquivo, nunca telemetria remota. */
async function registrar(evento: string, detalhe: string): Promise<void> {
  try {
    await mkdir(dirname(caminhos.log), { recursive: true });
    await appendFile(caminhos.log, `${new Date().toISOString()} ${evento} :: ${detalhe}\n`);
  } catch {
    // Log e best-effort: falhar aqui nao pode derrubar um download.
  }
}

function abrirNoBrowser(url: string): void {
  // `start` do Windows via cmd, com a URL como ARGUMENTO — nunca concatenada
  // numa string de shell.
  const filho = spawn('cmd', ['/c', 'start', '', url], {
    shell: false,
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
  });
  filho.unref();
}

principal().catch(async (erro: unknown) => {
  const detalhe = erro instanceof Error ? erro.message : String(erro);

  // O `console.error` sozinho nao serve: a janela de console fecha junto com o
  // processo, entao a mensagem so pisca. E se o console ja tiver sido liberado,
  // ela nem chega a piscar. Uma caixa nativa espera a pessoa (AT-107).
  console.error('Falha ao iniciar:', detalhe);
  await registrar('arranque falhou', detalhe);
  await avisarFalhaFatal(
    'youtube-downloader',
    `Não consegui iniciar o aplicativo.\n\n${detalhe}\n\nTente executar de novo. Se continuar, reinicie o computador.`,
  );

  process.exit(1);
});

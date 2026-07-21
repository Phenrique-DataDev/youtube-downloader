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

const PORTA_PREFERIDA = 47821;

const caminhos = resolverCaminhos();
let estado: EstadoBootstrap = { fase: 'verificando' };

async function principal(): Promise<void> {
  const raizUi = join(dirname(fileURLToPath(import.meta.url)), 'ui');

  const servidor = await iniciarServidor(
    raizUi,
    {
      estadoBootstrap: () => estado,

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

        // Confinamento do destino: o template `-o` e nosso, mas a raiz passa
        // por checagem explicita mesmo assim.
        const destino = resolve(caminhos.downloads);
        if (!caminhoEstaConfinado(destino, resolve(caminhos.downloads))) {
          return {
            ok: false,
            erro: { mensagem: 'Destino inválido.', detalhe: '', temporario: false },
          };
        }

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

  console.log(`Abrindo ${servidor.url}`);
  abrirNoBrowser(servidor.url);

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

principal().catch((erro: unknown) => {
  console.error('Falha ao iniciar:', erro);
  process.exit(1);
});

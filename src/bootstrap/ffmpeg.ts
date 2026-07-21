/**
 * Bootstrap do ffmpeg/ffprobe (AT-003, SC-8).
 *
 * Ciclo de vida OPOSTO ao do yt-dlp (ver deps.ts): o ffmpeg e PINADO. Nao se
 * atualiza sozinho, porque nao precisa — a interface que usamos (`-x`, muxing)
 * e estavel ha anos, e trocar de versao na maquina do usuario sem aviso so
 * adiciona um modo de falha que ninguem pediu. Mudar de versao e uma decisao
 * do projeto, num release, revisada.
 *
 * FONTE — medida, nao suposta. Tres candidatos em 2026-07-21; o gargalo acabou
 * sendo o HOST, nao o tamanho do arquivo:
 *
 *   gyan.dev   106 MB @ 0,28 MB/s -> ~10 min   (URL permanente)
 *   BtbN       167 MB @   25 MB/s -> ~2 s      (tag autobuild, PODADA com o tempo)
 *   Release nosso  =BtbN em velocidade, URL permanente — mas exige repo publico
 *
 * Dez minutos de primeira execucao reprova o AT-003 na pratica, entao gyan.dev
 * saiu. A escolha ideal seria re-hospedar num Release nosso (rapido E
 * permanente), mas asset de repo PRIVADO nao baixa sem token, e o bootstrap faz
 * fetch anonimo. Enquanto o repo nao for publico, ficamos no BtbN.
 *
 * DIVIDA CONHECIDA: a tag `autobuild-<data>` do BtbN e podada com o tempo, e
 * quando isso acontecer esta URL passa a dar 404 — quebrando a primeira
 * execucao de todo mundo de uma vez, longe do commit que causou. Por isso o CI
 * vigia a URL diariamente (.github/workflows/pin-ffmpeg.yml): a divida e
 * monitorada, nao esquecida. Ao publicar o repo, migrar para Release proprio
 * (ver docs/adr/0001-fonte-do-ffmpeg.md).
 *
 * HASH — por que a constante e daqui e nao do `checksums.sha256` do servidor:
 * baixar o binario e o checksum do MESMO servidor nao prova nada — quem troca
 * um troca o outro. O hash abaixo foi verificado baixando o pacote e vive no
 * CODIGO, sob revisao de commit. E o unico ponto do bootstrap onde a confianca
 * e ancorada fora da rede.
 *
 * (O yt-dlp usa o SHA2-256SUMS da release justamente porque NAO pode ser
 * pinado — ele precisa acompanhar o YouTube. Trocas diferentes, decisoes
 * diferentes.)
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { ErroDeIntegridade } from './hash.ts';
import { existe, ffmpegPresente, type OpcoesBootstrap } from './deps.ts';

export interface PinFfmpeg {
  /** De onde baixar o zip. */
  url: string;
  /** SHA256 esperado, ancorado no codigo (ver cabecalho). */
  sha256: string;
  /** Como o pacote aparece nas mensagens de erro. */
  rotulo: string;
}

/**
 * A tag do BtbN faz parte do pin: `latest` mudaria debaixo de nos e invalidaria
 * o hash sem aviso. O CI vigia esta URL (ver .github/workflows/pin-ffmpeg.yml).
 */
const BTBN_TAG = 'autobuild-2026-07-21-13-38';
const BTBN_ARQUIVO = 'ffmpeg-n8.1.2-29-g703dcc25b9-win64-gpl-8.1.zip';

export const PIN_PADRAO: PinFfmpeg = {
  url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/${BTBN_TAG}/${BTBN_ARQUIVO}`,
  // Baixado e verificado em 2026-07-21; confere com o checksums.sha256 da
  // mesma release (o cruzamento pega corrupcao, nao adulteracao — por isso a
  // ancora de confianca e esta constante, ver cabecalho).
  sha256: 'ebf57e8b1a10b176b88c3cbc66e68a4aed472cf47520b0fbf003e892fb3be642',
  rotulo: BTBN_ARQUIVO,
};

/** `-x` exige os DOIS: o ffprobe e binario separado (ver deps.ffmpegPresente). */
const BINARIOS = ['ffmpeg.exe', 'ffprobe.exe'] as const;

/**
 * Garante ffmpeg.exe + ffprobe.exe no cache. Idempotente.
 *
 * Nao e chamada em paralelo com `garantirYtdlp` de proposito: sao ~106 MB e
 * disputar banda com o download que o usuario pediu piora os dois.
 */
export async function garantirFfmpeg(
  opcoes: OpcoesBootstrap & { pin?: PinFfmpeg },
): Promise<void> {
  const { caminhos, aoMudarEstado, sinal } = opcoes;
  const pin = opcoes.pin ?? PIN_PADRAO;

  if (await ffmpegPresente(caminhos)) return;

  aoMudarEstado?.({ fase: 'baixando', oQue: 'ffmpeg', fracao: 0 });

  // Tudo acontece num temporario e so o resultado verificado entra no cache:
  // um download interrompido nunca deixa meio-ffmpeg.exe onde o app vai
  // procurar depois.
  const trabalho = await mkdtemp(join(tmpdir(), 'ytdl-ffmpeg-'));
  const zip = join(trabalho, 'ffmpeg.zip');

  try {
    const obtido = await baixarComProgresso(pin.url, zip, sinal, (fracao) => {
      aoMudarEstado?.({ fase: 'baixando', oQue: 'ffmpeg', fracao });
    });

    if (obtido !== pin.sha256) {
      throw new ErroDeIntegridade(pin.rotulo, pin.sha256, obtido);
    }

    const extraido = join(trabalho, 'saida');
    await mkdir(extraido, { recursive: true });
    await extrairBinarios(zip, extraido);

    // Confere os DOIS antes de copiar QUALQUER um. Copiar em fluxo e falhar no
    // meio deixaria um ffmpeg.exe de 99 MB orfao no cache — o proximo arranque
    // se recuperaria (ffmpegPresente exige os dois), mas o lixo ficaria.
    const origens = BINARIOS.map((nome) => ({ nome, caminho: join(extraido, nome) }));
    for (const { nome, caminho } of origens) {
      if (!(await existe(caminho))) {
        throw new Error(
          `O pacote do ffmpeg nao continha ${nome}. ` +
            'A estrutura do zip mudou — o pinning precisa ser revisto.',
        );
      }
    }

    await mkdir(caminhos.ffmpegDir, { recursive: true });
    for (const { nome, caminho } of origens) {
      await copyFile(caminho, join(caminhos.ffmpegDir, nome));
    }
  } finally {
    await rm(trabalho, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Baixa em streaming, calculando o SHA256 durante — nao carrega 106 MB na
 * memoria so para conferir o hash depois.
 */
async function baixarComProgresso(
  url: string,
  destino: string,
  sinal: AbortSignal | undefined,
  aoProgredir: (fracao: number | null) => void,
): Promise<string> {
  const resposta = await fetch(url, sinal ? { signal: sinal } : {});
  if (!resposta.ok || resposta.body === null) {
    throw new Error(`Falha ao baixar o ffmpeg: HTTP ${resposta.status}`);
  }

  const cabecalho = Number(resposta.headers.get('content-length'));
  const total = Number.isFinite(cabecalho) && cabecalho > 0 ? cabecalho : null;

  const hash = createHash('sha256');
  let recebido = 0;
  let ultimoAviso = 0;

  const fonte = Readable.fromWeb(resposta.body as Parameters<typeof Readable.fromWeb>[0]);
  fonte.on('data', (pedaco: Buffer) => {
    hash.update(pedaco);
    recebido += pedaco.length;
    if (total === null) return;
    // A UI nao ganha nada com um evento por chunk de 16 KB.
    const fracao = recebido / total;
    if (fracao - ultimoAviso >= 0.01) {
      ultimoAviso = fracao;
      aoProgredir(fracao);
    }
  });

  await pipeline(fonte, createWriteStream(destino));
  return hash.digest('hex');
}

/**
 * Extrai APENAS os dois binarios, via `tar.exe` do proprio Windows (bsdtar, le
 * zip; presente desde o Windows 10 1803).
 *
 * Duas escolhas aqui:
 * - Extrair so os membros necessarios: o pacote tem ffplay, doc/ e presets/ que
 *   nunca usamos — nao ha por que gravar ~200 MB em disco para apagar depois.
 * - Nao escrever um leitor de zip proprio: seria ~150 linhas de parsing
 *   sensivel (zip slip, cabecalhos malformados) para testar, quando o SO ja
 *   traz um implementacao madura.
 */
async function extrairBinarios(zip: string, destino: string): Promise<void> {
  // Caminho absoluto: nunca depender do PATH do usuario para achar o tar.
  const raiz = process.env['SystemRoot'] ?? 'C:\\Windows';
  const tar = join(raiz, 'System32', 'tar.exe');

  // O zip tem tudo sob `ffmpeg-<versao>-essentials_build/bin/`; --strip-components
  // derruba esses dois niveis e os binarios caem direto em `destino`.
  const argumentos = [
    '-xf',
    zip,
    '-C',
    destino,
    '--strip-components=2',
    ...BINARIOS.map((nome) => `*/bin/${nome}`),
  ];

  await new Promise<void>((resolver, rejeitar) => {
    const filho = spawn(tar, argumentos, { shell: false, windowsHide: true, stdio: 'pipe' });

    let erro = '';
    filho.stderr.on('data', (pedaco: Buffer) => {
      erro += pedaco.toString();
    });

    filho.on('error', rejeitar);
    filho.on('close', (codigo) => {
      if (codigo === 0) resolver();
      else rejeitar(new Error(`tar falhou (codigo ${codigo}): ${erro.trim()}`));
    });
  });
}

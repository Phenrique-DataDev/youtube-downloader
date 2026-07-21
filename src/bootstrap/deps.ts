/**
 * Bootstrap das dependencias externas (AT-003, AT-010, SC-7, SC-8).
 *
 * Ciclos de vida SEPARADOS de proposito:
 *
 * - yt-dlp: quebra quando o YouTube muda, entao precisa atualizar sozinho.
 *   Verificado empiricamente em 2026-07-20 que o binario da release aceita
 *   `-U` (nao cai em is_non_updateable), entao delegamos a atualizacao a ele
 *   em vez de reimplementar troca atomica e checksum.
 *
 * - ffmpeg: nao tem auto-update e nao precisa. E pinado numa versao com hash
 *   conhecido. Mudar de versao e decisao do projeto, num release, nunca algo
 *   que acontece na maquina do usuario sem aviso.
 */

import { mkdir, rm, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { executarYtdlp } from '../ytdlp/runner.ts';
import { sha256DeBytes, extrairHashEsperado, ErroDeIntegridade } from './hash.ts';
import type { CaminhosApp } from './paths.ts';

const RELEASE_YTDLP = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

export type EstadoBootstrap =
  | { fase: 'verificando' }
  | { fase: 'baixando'; oQue: string; fracao: number | null }
  | { fase: 'pronto' }
  | { fase: 'falhou'; mensagem: string };

export interface OpcoesBootstrap {
  caminhos: CaminhosApp;
  aoMudarEstado?: (estado: EstadoBootstrap) => void;
  sinal?: AbortSignal;
}

export async function existe(caminho: string): Promise<boolean> {
  try {
    await access(caminho);
    return true;
  } catch {
    return false;
  }
}

/**
 * Garante o yt-dlp no cache. Idempotente: se ja existe, nao rebaixa.
 * O ffmpeg tem funcao propria porque a fonte e o pinning sao diferentes.
 */
export async function garantirYtdlp(opcoes: OpcoesBootstrap): Promise<void> {
  const { caminhos, aoMudarEstado, sinal } = opcoes;

  if (await existe(caminhos.ytdlp)) return;

  aoMudarEstado?.({ fase: 'baixando', oQue: 'yt-dlp', fracao: null });
  await mkdir(dirname(caminhos.ytdlp), { recursive: true });

  // Baixa o binario e a lista de checksums da MESMA release.
  const [binario, sums] = await Promise.all([
    baixarBytes(`${RELEASE_YTDLP}/yt-dlp.exe`, sinal),
    baixarTexto(`${RELEASE_YTDLP}/SHA2-256SUMS`, sinal),
  ]);

  // O nome procurado e o nome ORIGINAL do arquivo na release. Se algum dia
  // alguem renomear o destino, esta busca falha e o download e RECUSADO —
  // que e o comportamento correto, nunca "seguir sem verificar".
  const esperado = extrairHashEsperado(sums, 'yt-dlp.exe');
  const obtido = sha256DeBytes(binario);

  if (esperado === null || esperado !== obtido) {
    throw new ErroDeIntegridade('yt-dlp.exe', esperado, obtido);
  }

  await writeFile(caminhos.ytdlp, binario, { mode: 0o755 });
}

/**
 * Atualizacao do yt-dlp — roda EM PARALELO ao arranque da UI, nunca bloqueia
 * (SC-1 x SC-7). Falha aqui e silenciosa por design: um update que nao rolou
 * nao impede o usuario de baixar com a versao que ja tem.
 */
export async function atualizarYtdlpEmSegundoPlano(caminhos: CaminhosApp): Promise<boolean> {
  if (!(await existe(caminhos.ytdlp))) return false;

  try {
    const r = await executarYtdlp(caminhos.ytdlp, ['--ignore-config', '-U'], {
      timeoutMs: 120_000,
    });
    // Cada atualizacao bem-sucedida deixa um `.old` de ~18 MB para tras.
    // Medido em 2026-07-20. Sem esta limpeza o cache cresce a cada update.
    await limparResiduosDeUpdate(caminhos.ytdlp);
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

async function limparResiduosDeUpdate(caminhoBinario: string): Promise<void> {
  for (const sufixo of ['.old', '.new']) {
    await rm(`${caminhoBinario}${sufixo}`, { force: true }).catch(() => {});
  }
}

/**
 * ffmpeg + ffprobe. `-x` exige AMBOS — o ffprobe e binario separado, e a
 * ausencia dele so aparece na hora de converter, com erro confuso.
 */
export async function ffmpegPresente(caminhos: CaminhosApp): Promise<boolean> {
  const [ff, probe] = await Promise.all([
    existe(join(caminhos.ffmpegDir, 'ffmpeg.exe')),
    existe(join(caminhos.ffmpegDir, 'ffprobe.exe')),
  ]);
  return ff && probe;
}

async function baixarBytes(url: string, sinal?: AbortSignal): Promise<Uint8Array> {
  const resposta = await fetch(url, sinal ? { signal: sinal } : {});
  if (!resposta.ok) {
    throw new Error(`Falha ao baixar ${url}: HTTP ${resposta.status}`);
  }
  return new Uint8Array(await resposta.arrayBuffer());
}

async function baixarTexto(url: string, sinal?: AbortSignal): Promise<string> {
  const resposta = await fetch(url, sinal ? { signal: sinal } : {});
  if (!resposta.ok) {
    throw new Error(`Falha ao baixar ${url}: HTTP ${resposta.status}`);
  }
  return await resposta.text();
}

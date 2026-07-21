/**
 * Download real. Traduz as duas saidas do yt-dlp — progresso e caminho final —
 * para eventos que a UI entende, e classifica a falha quando ela vem.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { montarArgsDownload, type Formato } from '../core/selectors.ts';
import { parsearLinhaProgresso, type EventoProgresso } from '../core/progress.ts';
import { classificarStderr, type ErroClassificado } from '../core/errors.ts';
import { executarYtdlp } from './runner.ts';

export interface PedidoDownload {
  urlCanonica: string;
  formato: Formato;
  alturaPreferida?: number;
  destino: string;
  ffmpegDir: string;
}

export type ResultadoDownload =
  { ok: true; caminhoArquivo: string } | { ok: false; erro: ErroClassificado };

export interface ObservadoresDownload {
  aoProgredir?: (evento: EventoProgresso) => void;
  sinal?: AbortSignal;
}

export async function baixar(
  binarioYtdlp: string,
  pedido: PedidoDownload,
  observadores: ObservadoresDownload = {},
): Promise<ResultadoDownload> {
  // O caminho final e escrito num arquivo temporario em vez de no stdout:
  // `--print` silenciaria o canal de progresso do pos-processamento.
  const dirTemp = await mkdtemp(join(tmpdir(), 'ytdl-caminho-'));
  const arquivoDeCaminho = join(dirTemp, 'destino.txt');

  try {
    const args = montarArgsDownload({
      urlCanonica: pedido.urlCanonica,
      formato: pedido.formato,
      ...(pedido.alturaPreferida !== undefined ? { alturaPreferida: pedido.alturaPreferida } : {}),
      destino: pedido.destino,
      ffmpegDir: pedido.ffmpegDir,
      arquivoDeCaminho,
    });

    const execucao = await executarYtdlp(binarioYtdlp, args, {
      ...(observadores.sinal ? { sinal: observadores.sinal } : {}),
      aoReceberLinha: (linha) => {
        const progresso = parsearLinhaProgresso(linha);
        if (progresso !== null) observadores.aoProgredir?.(progresso);
      },
    });

    if (execucao.exitCode !== 0) {
      return { ok: false, erro: classificarStderr(execucao.stderr, execucao.exitCode) };
    }

    const caminhoArquivo = await lerCaminhoFinal(arquivoDeCaminho);
    if (caminhoArquivo === null) {
      // Exit code 0 sem caminho gravado nao deveria acontecer. Se acontecer, e
      // mais honesto falhar do que anunciar sucesso sem saber onde o arquivo
      // esta — o usuario nao teria como encontra-lo.
      return {
        ok: false,
        erro: classificarStderr(
          'yt-dlp terminou com sucesso mas nao informou o caminho do arquivo',
          execucao.exitCode,
        ),
      };
    }

    return { ok: true, caminhoArquivo };
  } finally {
    await rm(dirTemp, { recursive: true, force: true }).catch(() => {});
  }
}

async function lerCaminhoFinal(arquivo: string): Promise<string | null> {
  try {
    const conteudo = await readFile(arquivo, 'utf8');
    // Um download = uma linha. Pegamos a ultima nao-vazia por seguranca.
    const linhas = conteudo
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return linhas.at(-1) ?? null;
  } catch {
    return null;
  }
}

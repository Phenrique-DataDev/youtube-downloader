/**
 * Download real. Traduz as duas saidas do yt-dlp — progresso e caminho final —
 * para eventos que a UI entende, e classifica a falha quando ela vem.
 */

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
  const args = montarArgsDownload({
    urlCanonica: pedido.urlCanonica,
    formato: pedido.formato,
    ...(pedido.alturaPreferida !== undefined ? { alturaPreferida: pedido.alturaPreferida } : {}),
    destino: pedido.destino,
    ffmpegDir: pedido.ffmpegDir,
  });

  /**
   * O stdout mistura tres coisas: linhas de progresso (JSON), a saida do
   * `--print` (o caminho final) e ruido do extrator. Separamos aqui.
   */
  const caminhosImpressos: string[] = [];

  const execucao = await executarYtdlp(binarioYtdlp, args, {
    ...(observadores.sinal ? { sinal: observadores.sinal } : {}),
    aoReceberLinha: (linha) => {
      const progresso = parsearLinhaProgresso(linha);
      if (progresso !== null) {
        observadores.aoProgredir?.(progresso);
        return;
      }
      const texto = linha.trim();
      // Nao e progresso: candidato a ser o caminho do `after_move:filepath`.
      if (texto.length > 0 && !texto.startsWith('[') && !texto.startsWith('{')) {
        caminhosImpressos.push(texto);
      }
    },
  });

  if (execucao.exitCode !== 0) {
    return { ok: false, erro: classificarStderr(execucao.stderr, execucao.exitCode) };
  }

  const caminhoArquivo = caminhosImpressos.at(-1);
  if (caminhoArquivo === undefined) {
    // Exit code 0 sem caminho impresso nao deveria acontecer. Se acontecer,
    // e mais honesto falhar do que anunciar sucesso sem saber onde o arquivo
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
}

/**
 * Camada 2 de defesa: sonda `-J`.
 *
 * O `-J` simula por default — traz titulo, duracao, thumbnail e o catalogo de
 * formats sem baixar um byte (AT-012). E a forma mais barata de descobrir que
 * o video nao serve antes de comecar a gastar banda.
 */

import { montarArgsProbe } from '../core/selectors.ts';
import {
  classificarPorMetadados,
  classificarStderr,
  type ErroClassificado,
} from '../core/errors.ts';
import { executarYtdlp } from './runner.ts';

export interface ResolucaoDisponivel {
  altura: number;
  rotulo: string;
}

export interface MetadadosVideo {
  id: string;
  titulo: string;
  duracaoSegundos: number | null;
  thumbnail: string | null;
  canal: string | null;
  /**
   * Resolucoes que ESTE video realmente tem, extraidas do catalogo. O painel
   * avancado e preenchido com isto — nunca com um menu fixo 1080/720/480 que
   * pode nao corresponder a realidade.
   */
  resolucoes: ResolucaoDisponivel[];
}

export type ResultadoSonda =
  { ok: true; metadados: MetadadosVideo } | { ok: false; erro: ErroClassificado };

interface FormatoBruto {
  height?: unknown;
  vcodec?: unknown;
}

interface JsonSonda {
  id?: unknown;
  title?: unknown;
  duration?: unknown;
  thumbnail?: unknown;
  uploader?: unknown;
  channel?: unknown;
  availability?: unknown;
  live_status?: unknown;
  formats?: unknown;
}

export async function sondar(
  binarioYtdlp: string,
  urlCanonica: string,
  ffmpegDir: string,
  sinal?: AbortSignal,
): Promise<ResultadoSonda> {
  const args = montarArgsProbe(urlCanonica, ffmpegDir);

  const execucao = await executarYtdlp(binarioYtdlp, args, {
    ...(sinal ? { sinal } : {}),
    // A sonda deve falhar rapido. A persistencia e do download real.
    timeoutMs: 45_000,
  });

  if (execucao.exitCode !== 0) {
    return { ok: false, erro: classificarStderr(execucao.stderr, execucao.exitCode) };
  }

  let json: JsonSonda;
  try {
    json = JSON.parse(execucao.stdout) as JsonSonda;
  } catch {
    return { ok: false, erro: classificarStderr(execucao.stderr, execucao.exitCode) };
  }

  // Preferir campo estruturado a grep de stderr: quando o -J funcionou, estes
  // campos classificam sem depender de string do extrator.
  const porMetadados = classificarPorMetadados(texto(json.availability), texto(json.live_status));
  if (porMetadados !== null) {
    return { ok: false, erro: porMetadados };
  }

  return {
    ok: true,
    metadados: {
      id: texto(json.id) ?? '',
      titulo: texto(json.title) ?? 'Video sem titulo',
      duracaoSegundos: typeof json.duration === 'number' ? json.duration : null,
      thumbnail: texto(json.thumbnail),
      canal: texto(json.channel) ?? texto(json.uploader),
      resolucoes: extrairResolucoes(json.formats),
    },
  };
}

function extrairResolucoes(formats: unknown): ResolucaoDisponivel[] {
  if (!Array.isArray(formats)) return [];

  const alturas = new Set<number>();
  for (const bruto of formats as FormatoBruto[]) {
    // Sem trilha de video nao ha resolucao a oferecer.
    if (bruto.vcodec === 'none' || bruto.vcodec === undefined) continue;
    if (typeof bruto.height === 'number' && bruto.height > 0) alturas.add(bruto.height);
  }

  return [...alturas].sort((a, b) => b - a).map((altura) => ({ altura, rotulo: `${altura}p` }));
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
}

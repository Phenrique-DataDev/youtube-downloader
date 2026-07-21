/**
 * Traducao das linhas de `--progress-template` para o evento que a UI consome.
 *
 * Regra central (DESIGN): ler `total_bytes` e `total_bytes_estimate` JUNTOS,
 * nao escolher um. Na medicao real de 2026-07-20 o primeiro veio preenchido e o
 * segundo veio ausente — o inverso do que se assume para DASH. Assumir um dos
 * dois produz barra travada ou NaN%.
 */

export interface EventoProgresso {
  fase: 'download' | 'postprocess';
  /** 0..1, ou null quando genuinamente indeterminado. */
  fracao: number | null;
  bytesFeitos: number;
  bytesTotais: number | null;
  velocidade: number | null;
  etaSegundos: number | null;
  concluido: boolean;
}

/**
 * Forma achatada da linha. Nao usamos uniao discriminada aqui de proposito:
 * o JSON vem de fora e pode chegar com qualquer subconjunto de campos, entao
 * validamos campo a campo em vez de confiar no formato.
 */
interface LinhaProgressoBruta {
  tipo?: unknown;
  status?: unknown;
  done?: unknown;
  total?: unknown;
  est?: unknown;
  speed?: unknown;
  eta?: unknown;
  fragIdx?: unknown;
  fragTotal?: unknown;
  pp?: unknown;
}

/**
 * Devolve null para linha que nao e progresso (o yt-dlp intercala avisos e a
 * saida do `--print` no mesmo stdout).
 */
export function parsearLinhaProgresso(linha: string): EventoProgresso | null {
  const texto = linha.trim();
  if (!texto.startsWith('{')) return null;

  let dado: unknown;
  try {
    dado = JSON.parse(texto);
  } catch {
    // Linha malformada nao derruba o download. Se um campo novo aparecer sem
    // default, preferimos perder um quadro de progresso a abortar.
    return null;
  }

  if (typeof dado !== 'object' || dado === null || !('tipo' in dado)) return null;
  const registro = dado as LinhaProgressoBruta;

  if (registro.tipo === 'postprocess') {
    return {
      fase: 'postprocess',
      fracao: null,
      bytesFeitos: 0,
      bytesTotais: null,
      velocidade: null,
      etaSegundos: null,
      concluido: registro.status === 'finished',
    };
  }

  if (registro.tipo !== 'download') return null;

  const feitos = numero(registro.done);
  const totais = primeiroNaoZero(numero(registro.total), numero(registro.est));

  return {
    fase: 'download',
    fracao: calcularFracao(feitos, totais, numero(registro.fragIdx), numero(registro.fragTotal)),
    bytesFeitos: feitos,
    bytesTotais: totais,
    velocidade: nuloSeZero(numero(registro.speed)),
    etaSegundos: nuloSeZero(numero(registro.eta)),
    // Status desconhecido e IGNORADO, nao tratado como erro — e o contrato de
    // compatibilidade adiante quando o yt-dlp se atualizar.
    concluido: registro.status === 'finished',
  };
}

function calcularFracao(
  feitos: number,
  totais: number | null,
  fragIdx: number,
  fragTotal: number,
): number | null {
  if (totais !== null && totais > 0) {
    return Math.min(feitos / totais, 1);
  }
  // Fallback com fragmentos: quando nem total nem estimativa existem, o
  // contador de fragmentos ainda da uma barra honesta.
  if (fragTotal > 0) {
    return Math.min(fragIdx / fragTotal, 1);
  }
  return null;
}

function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

function primeiroNaoZero(a: number, b: number): number | null {
  if (a > 0) return a;
  if (b > 0) return b;
  return null;
}

function nuloSeZero(valor: number): number | null {
  return valor > 0 ? valor : null;
}

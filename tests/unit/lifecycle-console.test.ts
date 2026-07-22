import { describe, it, expect } from 'vitest';
import {
  ambienteSuportaFfi,
  esconderConsole,
  avisarFalhaFatal,
  paraUtf16,
} from '../../src/lifecycle/console.ts';

/**
 * Sob Node — que e onde esta suite roda — `bun:ffi` nao existe e o modulo
 * inteiro e no-op. Entao o que da para provar aqui e (a) `paraUtf16`, que e
 * puro e independe de runtime, e (b) o contrato "nunca lanca" das duas funcoes
 * nativas. O efeito real da janela sumindo so se verifica sob Bun, em
 * `scripts/verificar-console.mjs`.
 */

/** Le um code unit UTF-16LE do buffer, para conferir a ordem dos bytes. */
function unidadeEm(bytes: Uint8Array, indice: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(indice * 2, true);
}

/** Decodifica de volta, descartando o terminador NUL. */
function decodificar(bytes: Uint8Array): string {
  return new TextDecoder('utf-16le').decode(bytes.subarray(0, bytes.length - 2));
}

describe('paraUtf16', () => {
  it('reserva 2 bytes por caractere mais o terminador', () => {
    expect(paraUtf16('abc')).toHaveLength(8);
    expect(paraUtf16('')).toHaveLength(2);
  });

  /**
   * Sem o NUL, `MessageBoxW` continua lendo memoria depois do texto — a caixa
   * aparece com lixo no fim, ou nao aparece.
   */
  it('termina em NUL', () => {
    const bytes = paraUtf16('ok');

    expect(bytes[bytes.length - 2]).toBe(0);
    expect(bytes[bytes.length - 1]).toBe(0);
  });

  it('a string vazia e so o terminador', () => {
    expect(Array.from(paraUtf16(''))).toEqual([0, 0]);
  });

  /**
   * Little-endian, nao big-endian. `€` (U+20AC) e o caso que distingue os dois:
   * em LE sai [0xAC, 0x20], em BE sairia [0x20, 0xAC]. Com so ASCII no teste, a
   * ordem errada passaria despercebida — o byte alto e zero.
   */
  it('e little-endian', () => {
    const bytes = paraUtf16('€');

    expect(bytes[0]).toBe(0xac);
    expect(bytes[1]).toBe(0x20);
  });

  it('ASCII ocupa o byte baixo, com o alto zerado', () => {
    const bytes = paraUtf16('A');

    expect(bytes[0]).toBe(0x41);
    expect(bytes[1]).toBe(0x00);
  });

  /**
   * O texto de falha fatal e em portugues e tem acento em quase toda frase (a
   * mensagem real de `main.ts` comeca com "Não consegui iniciar"). Passar UTF-8
   * aqui renderiza caixa vazia ou lixo — exatamente na hora em que a mensagem e
   * a unica coisa que a pessoa tem.
   */
  it('preserva acento — "nao consegui" com til e acento', () => {
    const texto = 'Não consegui iniciar o aplicativo';

    expect(decodificar(paraUtf16(texto))).toBe(texto);
  });

  it('cada caractere acentuado vira seu proprio code point', () => {
    const bytes = paraUtf16('ãçé');

    expect(unidadeEm(bytes, 0)).toBe(0x00e3); // ã
    expect(unidadeEm(bytes, 1)).toBe(0x00e7); // ç
    expect(unidadeEm(bytes, 2)).toBe(0x00e9); // é
    expect(unidadeEm(bytes, 3)).toBe(0); // terminador
  });

  /**
   * Fora do BMP o par de substitutos ja E a representacao UTF-16 — copiar code
   * unit a code unit acerta por construcao. O teste fixa isso: uma futura
   * "otimizacao" usando code points quebraria aqui.
   */
  it('sobrevive a par de substitutos (fora do BMP)', () => {
    const texto = 'fim \u{1F600}';

    expect(decodificar(paraUtf16(texto))).toBe(texto);
  });

  it.each([
    ['linha quebrada', 'primeira\n\nsegunda'],
    ['aspas e barras', 'C:\\Users\\Ana "Paula"'],
    ['mensagem real de falha', 'Não consegui iniciar o aplicativo.\n\nTente executar de novo.'],
  ])('ida e volta preserva %s', (_rotulo, texto) => {
    expect(decodificar(paraUtf16(texto))).toBe(texto);
  });
});

describe('no-op fora do Bun', () => {
  it('Node nao suporta ffi', () => {
    // Se isto falhar, a suite passou a rodar sob Bun e os dois testes abaixo
    // deixaram de exercitar o caminho que dizem exercitar.
    expect(ambienteSuportaFfi()).toBe(false);
  });

  /**
   * O contrato e "nunca lanca": esconder a janela e SHOULD, nao MUST. Uma
   * excecao aqui derrubaria o app inteiro por causa de um detalhe cosmetico —
   * trocaria um incomodo por uma falha total.
   */
  it('esconderConsole devolve false sem lancar', async () => {
    await expect(esconderConsole()).resolves.toBe(false);
  });

  /**
   * Este e mais grave: `avisarFalhaFatal` roda no handler de erro de arranque.
   * Se ELE lancar, a excecao original se perde e o processo morre sem mensagem
   * nenhuma — o pior modo de falha possivel para este publico.
   */
  it('avisarFalhaFatal devolve false sem lancar', async () => {
    await expect(avisarFalhaFatal('titulo', 'mensagem')).resolves.toBe(false);
  });

  it('avisarFalhaFatal nao lanca nem com texto acentuado e vazio', async () => {
    await expect(avisarFalhaFatal('', '')).resolves.toBe(false);
    await expect(avisarFalhaFatal('youtube-downloader', 'Não consegui iniciar.')).resolves.toBe(
      false,
    );
  });
});

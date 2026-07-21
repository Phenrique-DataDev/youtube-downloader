import { describe, it, expect } from 'vitest';
import { parsearLinhaProgresso } from '../../src/core/progress.ts';

describe('parsing de progresso', () => {
  it('usa total_bytes quando presente', () => {
    const linha = JSON.stringify({
      tipo: 'download',
      status: 'downloading',
      done: 9147055,
      total: 18294110,
      est: 0,
      speed: 1048576,
      eta: 9,
      fragIdx: 0,
      fragTotal: 0,
    });
    const e = parsearLinhaProgresso(linha);
    expect(e?.fracao).toBeCloseTo(0.5);
    expect(e?.bytesTotais).toBe(18294110);
    expect(e?.velocidade).toBe(1048576);
  });

  it('cai em total_bytes_estimate quando total_bytes vem zerado', () => {
    const linha = JSON.stringify({
      tipo: 'download',
      status: 'downloading',
      done: 500,
      total: 0,
      est: 2000,
      speed: 0,
      eta: 0,
      fragIdx: 0,
      fragTotal: 0,
    });
    const e = parsearLinhaProgresso(linha);
    expect(e?.fracao).toBeCloseTo(0.25);
    expect(e?.bytesTotais).toBe(2000);
  });

  it('cai em fragmentos quando nem total nem estimativa existem', () => {
    const linha = JSON.stringify({
      tipo: 'download',
      status: 'downloading',
      done: 100,
      total: 0,
      est: 0,
      speed: 0,
      eta: 0,
      fragIdx: 3,
      fragTotal: 12,
    });
    const e = parsearLinhaProgresso(linha);
    expect(e?.fracao).toBeCloseTo(0.25);
    expect(e?.bytesTotais).toBeNull();
  });

  it('devolve fracao null — nunca NaN — quando nao ha como saber', () => {
    const linha = JSON.stringify({
      tipo: 'download',
      status: 'downloading',
      done: 1234,
      total: 0,
      est: 0,
      speed: 0,
      eta: 0,
      fragIdx: 0,
      fragTotal: 0,
    });
    const e = parsearLinhaProgresso(linha);
    expect(e?.fracao).toBeNull();
    expect(Number.isNaN(e?.fracao as number)).toBe(false);
  });

  it('nunca passa de 100% mesmo com dados inconsistentes', () => {
    const linha = JSON.stringify({
      tipo: 'download',
      status: 'downloading',
      done: 5000,
      total: 1000,
      est: 0,
      speed: 0,
      eta: 0,
      fragIdx: 0,
      fragTotal: 0,
    });
    expect(parsearLinhaProgresso(linha)?.fracao).toBe(1);
  });

  it('reconhece o segundo canal (postprocess) — sem ele a barra congela em 100%', () => {
    const linha = JSON.stringify({ tipo: 'postprocess', status: 'started', pp: 'ExtractAudio' });
    const e = parsearLinhaProgresso(linha);
    expect(e?.fase).toBe('postprocess');
    expect(e?.concluido).toBe(false);
  });

  it('marca concluido em status finished', () => {
    const linha = JSON.stringify({
      tipo: 'download',
      status: 'finished',
      done: 100,
      total: 100,
      est: 0,
      speed: 0,
      eta: 0,
      fragIdx: 0,
      fragTotal: 0,
    });
    expect(parsearLinhaProgresso(linha)?.concluido).toBe(true);
  });

  it('IGNORA status desconhecido em vez de tratar como erro (compat adiante)', () => {
    const linha = JSON.stringify({
      tipo: 'download',
      status: 'algum_status_futuro',
      done: 50,
      total: 100,
      est: 0,
      speed: 0,
      eta: 0,
      fragIdx: 0,
      fragTotal: 0,
    });
    const e = parsearLinhaProgresso(linha);
    expect(e).not.toBeNull();
    expect(e?.concluido).toBe(false);
    expect(e?.fracao).toBeCloseTo(0.5);
  });

  describe('robustez contra linhas que nao sao progresso', () => {
    const naoProgresso = [
      '[youtube] Extracting URL: https://www.youtube.com/watch?v=abc',
      'WARNING: YouTube extraction without a JS runtime has been deprecated',
      'C:\\Users\\Pedro\\Downloads\\video [abc].mp4',
      '',
      '   ',
    ];
    it.each(naoProgresso)('ignora %j', (linha) => {
      expect(parsearLinhaProgresso(linha)).toBeNull();
    });
  });

  it('nao derruba o download quando a linha e JSON malformado', () => {
    // Exatamente o caso do `NA` sem default: `{"total":NA}` nao e JSON valido.
    expect(() => parsearLinhaProgresso('{"tipo":"download","total":NA}')).not.toThrow();
    expect(parsearLinhaProgresso('{"tipo":"download","total":NA}')).toBeNull();
  });
});

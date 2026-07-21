import { describe, it, expect } from 'vitest';
import { classificarStderr, classificarPorMetadados } from '../../src/core/errors.ts';
import * as fx from '../fixtures/stderr.ts';

describe('AT-006/007/008 — classificacao a partir de stderr real', () => {
  it('AT-006: video inexistente -> indisponivel', () => {
    const r = classificarStderr(fx.VIDEO_INEXISTENTE, 1);
    expect(r.categoria).toBe('indisponivel');
    expect(r.temporario).toBe(false);
  });

  it('AT-006: video removido -> indisponivel', () => {
    expect(classificarStderr(fx.VIDEO_INDISPONIVEL, 1).categoria).toBe('indisponivel');
  });

  it('AT-007: falha de conexao -> sem-rede, e nao "indisponivel"', () => {
    const r = classificarStderr(fx.SEM_REDE, 1);
    expect(r.categoria).toBe('sem-rede');
    expect(r.temporario).toBe(true);
  });

  it('AT-007: nao depende do trecho localizado pelo SO', () => {
    // Mesma falha, com a parte do winsock em ingles: deve classificar igual.
    const emIngles = fx.SEM_REDE.replace(
      /Nenhuma conexao pode ser feita porque a maquina de destino as recusou ativamente/g,
      'No connection could be made because the target machine actively refused it',
    );
    expect(classificarStderr(emIngles, 1).categoria).toBe('sem-rede');
  });

  it('AT-008: anti-bot -> rate-limit', () => {
    const r = classificarStderr(fx.RATE_LIMIT_NAO_VERIFICADA, 1);
    expect(r.categoria).toBe('rate-limit');
    expect(r.temporario).toBe(true);
  });

  it('AT-008: "isn\'t available, try again later" e rate limit, NAO indisponivel', () => {
    // O erro de diagnostico mais caro da lista: classificar isso como
    // indisponivel faz o usuario achar que o video sumiu quando so precisa
    // esperar. A ordem dos padroes em errors.ts existe por causa deste caso.
    const r = classificarStderr(fx.RATE_LIMIT_ENGANOSA_NAO_VERIFICADA, 1);
    expect(r.categoria).toBe('rate-limit');
    expect(r.categoria).not.toBe('indisponivel');
    expect(r.mensagem).toContain('nao sumiu');
  });
});

describe('AT-013 — fallback generico obrigatorio', () => {
  it('stderr que nao casa com padrao nenhum -> desconhecido, sem lancar', () => {
    const r = classificarStderr(fx.DESCONHECIDA, 1);
    expect(r.categoria).toBe('desconhecido');
    expect(r.mensagem.length).toBeGreaterThan(0);
  });

  it('nunca vaza stderr cru na mensagem da UI', () => {
    const r = classificarStderr(fx.DESCONHECIDA, 1);
    expect(r.mensagem).not.toContain('ERROR:');
    expect(r.mensagem).not.toContain('codigo 42');
    // ...mas o detalhe tecnico preserva o bruto, atras de "ver detalhes".
    expect(r.detalhe).toContain('codigo 42');
  });

  it('sobrevive a stderr vazio', () => {
    const r = classificarStderr('', 1);
    expect(r.categoria).toBe('desconhecido');
    expect(r.detalhe).toContain('exit code 1');
  });

  it('sobrevive a exit code nulo (processo morto por sinal)', () => {
    expect(() => classificarStderr('qualquer coisa', null)).not.toThrow();
    expect(classificarStderr('qualquer coisa', null).detalhe).toContain('sem exit code');
  });

  it('o detalhe tecnico sempre inclui o exit code', () => {
    expect(classificarStderr(fx.VIDEO_INEXISTENTE, 1).detalhe).toContain('exit code 1');
  });
});

describe('classificacao por metadados estruturados (preferida ao grep)', () => {
  it('availability=private -> privado', () => {
    expect(classificarPorMetadados('private', null)?.categoria).toBe('privado');
  });

  it('availability=subscriber_only -> privado', () => {
    expect(classificarPorMetadados('subscriber_only', null)?.categoria).toBe('privado');
  });

  it('live_status=is_live -> ao-vivo', () => {
    expect(classificarPorMetadados('public', 'is_live')?.categoria).toBe('ao-vivo');
  });

  it('live_status=is_upcoming -> ao-vivo', () => {
    expect(classificarPorMetadados('public', 'is_upcoming')?.categoria).toBe('ao-vivo');
  });

  it('video normal -> null (nada a classificar, segue o fluxo)', () => {
    expect(classificarPorMetadados('public', 'not_live')).toBeNull();
    expect(classificarPorMetadados(undefined, undefined)).toBeNull();
  });
});

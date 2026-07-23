import { describe, it, expect, vi } from 'vitest';
import {
  tratarFalhaFatal,
  mensagemFalha,
  TITULO_FALHA,
  type DepsFalhaFatal,
} from '../../src/lifecycle/falha-fatal.ts';

/**
 * AT-107 — uma falha de arranque produz mensagem que PERMANECE na tela, 0
 * saidas silenciosas. O que era so verificavel "nunca lanca sob Node" agora e
 * verificavel de verdade: as dependencias sao injetadas, entao provamos que a
 * caixa nativa e chamada, com o texto certo, e ANTES do exit — sem abrir caixa
 * nenhuma no CI.
 */

/** Espioes que registram a ORDEM das chamadas, alem do fato de terem ocorrido. */
function deps(): { d: DepsFalhaFatal; ordem: string[] } {
  const ordem: string[] = [];
  return {
    ordem,
    d: {
      avisar: vi.fn(async (t: string, m: string) => {
        ordem.push(`avisar:${t}:${m.slice(0, 20)}`);
        return true;
      }),
      registrar: vi.fn(async () => {
        ordem.push('registrar');
      }),
      sair: vi.fn((c: number) => {
        ordem.push(`sair:${c}`);
      }),
    },
  };
}

describe('AT-107 — falha de arranque nao pode ser silenciosa', () => {
  it('chama a caixa nativa com titulo e mensagem, e ENTAO encerra com 1', async () => {
    const { d, ordem } = deps();

    await tratarFalhaFatal(new Error('porta 47821 inutilizavel'), d);

    expect(d.avisar).toHaveBeenCalledTimes(1);
    expect(d.avisar).toHaveBeenCalledWith(TITULO_FALHA, mensagemFalha('porta 47821 inutilizavel'));
    expect(d.sair).toHaveBeenCalledWith(1);

    // A ORDEM e o coracao do AT-107: a caixa aparece antes de o processo morrer.
    const iAvisar = ordem.findIndex((p) => p.startsWith('avisar:'));
    const iSair = ordem.indexOf('sair:1');
    expect(iAvisar).toBeGreaterThanOrEqual(0);
    expect(iSair).toBeGreaterThan(iAvisar);
  });

  it('a mensagem carrega o detalhe do erro e uma instrucao acionavel', () => {
    const msg = mensagemFalha('dependencia corrompida');
    expect(msg).toContain('dependencia corrompida');
    expect(msg).toMatch(/execut/i); // "Tente executar de novo"
    expect(msg).not.toMatch(/stack|at Object|\.ts:\d+/); // sem stacktrace cru
  });

  it('erro sem instancia de Error tambem vira mensagem, nao quebra', async () => {
    const { d } = deps();
    await tratarFalhaFatal('string crua de falha', d);
    expect(d.avisar).toHaveBeenCalledWith(TITULO_FALHA, mensagemFalha('string crua de falha'));
    expect(d.sair).toHaveBeenCalledWith(1);
  });

  it('encerra mesmo se a caixa falhar — reportar nao pode travar o exit', async () => {
    const { d } = deps();
    (d.avisar as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('FFI indisponivel'));

    // Nao pode propagar: o `finally` garante o exit.
    await expect(tratarFalhaFatal(new Error('x'), d)).resolves.toBeUndefined();
    expect(d.sair).toHaveBeenCalledWith(1);
  });

  it('encerra mesmo se o log falhar', async () => {
    const { d } = deps();
    (d.registrar as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('disco cheio'));

    await expect(tratarFalhaFatal(new Error('x'), d)).resolves.toBeUndefined();
    expect(d.sair).toHaveBeenCalledWith(1);
  });
});

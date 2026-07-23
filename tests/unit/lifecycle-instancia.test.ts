import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import {
  MARCADOR,
  detectarModo,
  deveAbrirNavegador,
  ehNossaIdentidade,
  sondarInstancia,
} from '../../src/lifecycle/instancia.ts';

describe('detectarModo', () => {
  it('sem flag e execucao explicita — foi a pessoa que pediu', () => {
    expect(detectarModo(['node', 'main.ts'])).toBe('explicito');
  });

  it('--silencioso e o autostart', () => {
    expect(detectarModo(['node', 'main.ts', '--silencioso'])).toBe('silencioso');
  });
});

/**
 * A tabela-verdade do desvio consciente do AT-101. O que decide abrir aba e a
 * PROCEDENCIA do processo, nao haver outra instancia: clicar no atalho e pedir
 * para usar o app agora, e responder com silencio faria o duplo-clique parecer
 * quebrado.
 */
describe('deveAbrirNavegador (AT-101b, AT-101c)', () => {
  it('explicito abre — a pessoa pediu', () => {
    expect(deveAbrirNavegador('explicito')).toBe(true);
  });

  it('silencioso nao abre — ninguem pediu nada no login', () => {
    expect(deveAbrirNavegador('silencioso')).toBe(false);
  });
});

describe('ehNossaIdentidade', () => {
  it('aceita o marcador', () => {
    expect(ehNossaIdentidade({ app: MARCADOR, pid: 123 })).toBe(true);
  });

  it.each([
    ['200 vazio', {}],
    ['outro app', { app: 'outra-coisa' }],
    ['nulo', null],
    ['string', 'youtube-downloader'],
    ['numero', 42],
  ])('recusa %s', (_rotulo, corpo) => {
    expect(ehNossaIdentidade(corpo)).toBe(false);
  });
});

describe('sondarInstancia', () => {
  let alvo: Server | undefined;

  afterEach(async () => {
    if (alvo) await new Promise<void>((r) => alvo!.close(() => r()));
    alvo = undefined;
  });

  /** Sobe um servidor que responde o que o teste mandar e devolve a porta. */
  function subir(responder: (url: string) => { status: number; corpo: string }): Promise<number> {
    alvo = createServer((req, res) => {
      const { status, corpo } = responder(req.url ?? '/');
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(corpo);
    });
    return new Promise((resolver) => {
      alvo!.listen(0, '127.0.0.1', () => {
        const e = alvo!.address();
        resolver(typeof e === 'object' && e !== null ? e.port : 0);
      });
    });
  }

  it('porta vazia => ninguem', async () => {
    // Sobe e derruba so para obter uma porta comprovadamente livre.
    const porta = await subir(() => ({ status: 200, corpo: '{}' }));
    await new Promise<void>((r) => alvo!.close(() => r()));
    alvo = undefined;

    expect(await sondarInstancia(porta, 300)).toBe('ninguem');
  });

  it('nosso marcador => nossa', async () => {
    const porta = await subir(() => ({
      status: 200,
      corpo: JSON.stringify({ app: MARCADOR, pid: 1 }),
    }));

    expect(await sondarInstancia(porta, 500)).toBe('nossa');
  });

  /**
   * AT-103: um servico alheio na porta preferida NAO pode ser confundido com o
   * app. Ceder a porta para ele deixaria a pessoa diante da interface de outro
   * programa achando que e a nossa.
   */
  it('servico alheio que responde 200 => terceiro, nunca nossa', async () => {
    const porta = await subir(() => ({ status: 200, corpo: JSON.stringify({ servico: 'outro' }) }));

    expect(await sondarInstancia(porta, 500)).toBe('terceiro');
  });

  it('responde, mas nao em JSON => terceiro', async () => {
    const porta = await subir(() => ({ status: 200, corpo: '<html>outra coisa</html>' }));

    expect(await sondarInstancia(porta, 500)).toBe('terceiro');
  });

  it('responde erro => terceiro', async () => {
    const porta = await subir(() => ({ status: 500, corpo: '{}' }));

    expect(await sondarInstancia(porta, 500)).toBe('terceiro');
  });
});

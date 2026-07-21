import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, request as requisicaoHttp, type Server } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { iniciarServidor, type ServidorLocal } from '../../src/server/http.ts';

/**
 * Sobe o servidor de verdade. Nao usa rede externa — so loopback — entao roda
 * rapido e nao depende do YouTube.
 */

let servidor: ServidorLocal;
let raizUi: string;

beforeAll(async () => {
  raizUi = await mkdtemp(join(tmpdir(), 'ytdl-ui-'));
  await writeFile(join(raizUi, 'index.html'), '<!doctype html><title>teste</title>');

  servidor = await iniciarServidor(raizUi, {
    sondar: async (url) => ({ eco: url }),
    baixar: async (_corpo, emitir) => {
      emitir('progresso', { fracao: 0.5 });
      return { ok: true };
    },
    estadoBootstrap: () => ({ fase: 'pronto' }),
  });
});

afterAll(async () => {
  await servidor?.fechar();
});

const comHost = (extra: Record<string, string> = {}) => ({
  Host: `127.0.0.1:${servidor.porta}`,
  ...extra,
});

describe('bind e alcance', () => {
  it('escuta em 127.0.0.1 numa porta valida', () => {
    expect(servidor.porta).toBeGreaterThan(0);
    expect(servidor.url).toContain('127.0.0.1');
  });

  it('a URL de abertura ja carrega o token', () => {
    expect(servidor.url).toContain(`t=${servidor.token}`);
    expect(servidor.token.length).toBeGreaterThanOrEqual(40);
  });

  /**
   * A asercao aqui era `toContain('teste')` — o fixture escrito no temp dir.
   * Ficou falsa em `81bdab1` (ADR 0002), que inverteu a precedencia de
   * proposito: o mapa embutido vence o disco, porque ler do disco em binario
   * empacotado servia a pasta de codigo da maquina de BUILD. O teste seguiu
   * cobrando o comportamento antigo e falhava desde entao.
   *
   * O que ele SEMPRE quis provar continua valendo: `/` responde 200 e devolve
   * a UI, sem exigir token. Muda so a fonte legitima dessa UI.
   */
  it('serve a UI embutida em / sem exigir token', async () => {
    const r = await fetch(`http://127.0.0.1:${servidor.porta}/`, { headers: comHost() });
    expect(r.status).toBe(200);
    const corpo = await r.text();
    expect(corpo).toContain('Baixar do YouTube');
    // E NAO o fixture do disco: em producao, servi-lo seria o bug do ADR 0002.
    expect(corpo).not.toContain('<title>teste</title>');
  });

  /**
   * O fallback de disco nao morreu — so deixou de valer para os nomes que o
   * build embute (`index.html`, `app.css`, `app.js`). Este arquivo nao esta no
   * mapa, entao exercita o unico caminho em que `raizUi` ainda decide algo.
   */
  it('cai no disco para arquivo que o build nao embute', async () => {
    await writeFile(join(raizUi, 'extra.txt'), 'vindo-do-disco');
    const r = await fetch(`http://127.0.0.1:${servidor.porta}/extra.txt`, { headers: comHost() });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('vindo-do-disco');
  });
});

describe('AT-009 — porta ocupada', () => {
  let ocupante: Server;
  let outro: ServidorLocal;

  afterAll(async () => {
    await outro?.fechar();
    await new Promise<void>((r) => ocupante.close(() => r()));
  });

  it('escolhe outra porta quando a preferida esta em uso', async () => {
    // Ocupa uma porta concreta.
    ocupante = createServer(() => {});
    const portaOcupada = await new Promise<number>((resolver) => {
      ocupante.listen(0, '127.0.0.1', () => {
        const e = ocupante.address();
        resolver(typeof e === 'object' && e !== null ? e.port : 0);
      });
    });

    // Pede exatamente a porta ocupada.
    outro = await iniciarServidor(
      raizUi,
      {
        sondar: async () => ({}),
        baixar: async () => ({}),
        estadoBootstrap: () => ({}),
      },
      portaOcupada,
    );

    expect(outro.porta).not.toBe(portaOcupada);
    expect(outro.porta).toBeGreaterThan(0);

    // E o servidor novo realmente responde.
    const r = await fetch(`http://127.0.0.1:${outro.porta}/`, {
      headers: { Host: `127.0.0.1:${outro.porta}` },
    });
    expect(r.status).toBe(200);
  });
});

describe('Security — token de sessao (CSRF local)', () => {
  it('recusa chamada de API sem token', async () => {
    const r = await fetch(`http://127.0.0.1:${servidor.porta}/api/estado`, {
      headers: comHost(),
    });
    expect(r.status).toBe(401);
  });

  it('recusa token errado', async () => {
    const r = await fetch(`http://127.0.0.1:${servidor.porta}/api/estado`, {
      headers: comHost({ 'x-token': 'token-de-atacante' }),
    });
    expect(r.status).toBe(401);
  });

  it('aceita o token correto', async () => {
    const r = await fetch(`http://127.0.0.1:${servidor.porta}/api/estado`, {
      headers: comHost({ 'x-token': servidor.token }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ fase: 'pronto' });
  });
});

/**
 * O `fetch` do Node (undici) IGNORA um header `Host` fornecido — ele e header
 * proibido pela spec. Testar rebinding com fetch daria falso verde: a
 * requisicao sairia com o Host correto e o teste "passaria" sem exercitar
 * nada. Por isso aqui usa-se o cliente http cru, que permite forjar o Host.
 */
function pedirComHost(
  caminho: string,
  host: string,
  cabecalhos: Record<string, string> = {},
): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const req = requisicaoHttp(
      {
        host: '127.0.0.1',
        port: servidor.porta,
        path: caminho,
        method: 'GET',
        headers: { Host: host, ...cabecalhos },
      },
      (res) => {
        res.resume();
        resolver(res.statusCode ?? 0);
      },
    );
    req.on('error', rejeitar);
    req.end();
  });
}

describe('Security — DNS rebinding', () => {
  it('o cliente cru realmente forja o Host (senao o resto do teste e falso verde)', async () => {
    // Controle: com o Host correto a mesma chamada passa.
    const status = await pedirComHost('/api/estado', `127.0.0.1:${servidor.porta}`, {
      'x-token': servidor.token,
    });
    expect(status).toBe(200);
  });

  it('recusa Host de dominio hostil apontando para loopback', async () => {
    expect(await pedirComHost('/api/estado', 'evil.example.com')).toBe(403);
  });

  it('a recusa acontece ANTES da checagem de token', async () => {
    // Host hostil + token VALIDO ainda deve dar 403, nao 200.
    const status = await pedirComHost('/api/estado', 'rebind.attacker.test', {
      'x-token': servidor.token,
    });
    expect(status).toBe(403);
  });

  it('recusa loopback na porta errada', async () => {
    expect(await pedirComHost('/api/estado', '127.0.0.1:1')).toBe(403);
  });
});

describe('Security — path traversal em arquivo estatico', () => {
  const tentativas = [
    '/../package.json',
    '/..%2fpackage.json',
    '/subdir/arquivo.txt',
    '/..\\package.json',
  ];

  it.each(tentativas)('recusa %s', async (rota) => {
    const r = await fetch(`http://127.0.0.1:${servidor.porta}${rota}`, { headers: comHost() });
    expect(r.status).toBe(404);
  });
});

describe('SSE', () => {
  it('emite eventos de progresso e um evento final', async () => {
    const r = await fetch(`http://127.0.0.1:${servidor.porta}/api/baixar`, {
      method: 'POST',
      headers: comHost({ 'x-token': servidor.token, 'content-type': 'application/json' }),
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=aBc123_-XyZ' }),
    });

    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/event-stream');

    const texto = await r.text();
    expect(texto).toContain('event: progresso');
    expect(texto).toContain('"fracao":0.5');
    expect(texto).toContain('event: fim');
  });
});

describe('robustez da API', () => {
  it('recusa corpo grande demais sem derrubar o servidor', async () => {
    const r = await fetch(`http://127.0.0.1:${servidor.porta}/api/sondar`, {
      method: 'POST',
      headers: comHost({ 'x-token': servidor.token, 'content-type': 'application/json' }),
      body: JSON.stringify({ url: 'x'.repeat(200_000) }),
    });
    expect(r.status).toBe(413);

    // O servidor continua vivo depois disso.
    const depois = await fetch(`http://127.0.0.1:${servidor.porta}/api/estado`, {
      headers: comHost({ 'x-token': servidor.token }),
    });
    expect(depois.status).toBe(200);
  });

  it('404 em rota de API inexistente', async () => {
    const r = await fetch(`http://127.0.0.1:${servidor.porta}/api/inexistente`, {
      headers: comHost({ 'x-token': servidor.token }),
    });
    expect(r.status).toBe(404);
  });
});

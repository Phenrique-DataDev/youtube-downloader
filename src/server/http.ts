/**
 * Servidor HTTP local. Serve a UI, expoe a API e emite progresso por SSE.
 *
 * SSE em vez de WebSocket: o progresso e unidirecional (servidor -> UI), SSE e
 * nativo no browser, reconecta sozinho e nao exige biblioteca. WebSocket seria
 * capacidade que nao usamos.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { obterAtivo } from '../ui/ativos.ts';
import { extname } from 'node:path';
import { hostEhPermitido, tokenConfere } from './guards.ts';

export interface ManipuladoresApi {
  sondar: (url: string) => Promise<unknown>;
  baixar: (
    corpo: unknown,
    emitir: (evento: string, dado: unknown) => void,
    sinal: AbortSignal,
  ) => Promise<unknown>;
  estadoBootstrap: () => unknown;
}

export interface ServidorLocal {
  porta: number;
  token: string;
  url: string;
  fechar: () => Promise<void>;
}

const TIPOS_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export async function iniciarServidor(
  raizUi: string,
  api: ManipuladoresApi,
  portaPreferida = 0,
): Promise<ServidorLocal> {
  // Token de sessao: 32 bytes de entropia real. Sem ele, qualquer pagina
  // aberta no browser poderia disparar downloads no app (CSRF local).
  const token = randomBytes(32).toString('base64url');

  const servidor = createServer((req, res) => {
    tratar(req, res, { raizUi, api, token, porta: () => porta }).catch((erro: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (erro instanceof CorpoGrandeDemais) {
        responderJson(res, 413, { erro: 'Requisicao grande demais' });
        // O cliente ainda pode estar enviando. Sem drenar, o socket morre com
        // ECONNRESET e a conexao seguinte (keep-alive) e derrubada junto.
        req.resume();
        return;
      }
      responderJson(res, 500, { erro: 'Erro interno' });
      req.resume();
    });
  });

  const porta = await escutar(servidor, portaPreferida);

  return {
    porta,
    token,
    url: `http://127.0.0.1:${porta}/?t=${token}`,
    fechar: () =>
      new Promise<void>((resolver) => {
        servidor.close(() => resolver());
        servidor.closeAllConnections();
      }),
  };
}

/**
 * AT-009: porta ocupada nao pode derrubar o app. Tenta a preferida e, se ela
 * estiver em uso, deixa o SO escolher uma livre.
 */
function escutar(
  servidor: ReturnType<typeof createServer>,
  portaPreferida: number,
): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const aoFalhar = (erro: NodeJS.ErrnoException) => {
      if (erro.code === 'EADDRINUSE' && portaPreferida !== 0) {
        servidor.removeListener('error', aoFalhar);
        // Porta 0 = o SO devolve qualquer porta livre.
        servidor.listen(0, '127.0.0.1', () => resolver(portaEm(servidor)));
        return;
      }
      rejeitar(erro);
    };

    servidor.once('error', aoFalhar);
    // Bind SEMPRE em 127.0.0.1, NUNCA 0.0.0.0: o app nao deve ser alcancavel
    // de fora da maquina.
    servidor.listen(portaPreferida, '127.0.0.1', () => {
      servidor.removeListener('error', aoFalhar);
      resolver(portaEm(servidor));
    });
  });
}

function portaEm(servidor: ReturnType<typeof createServer>): number {
  const endereco = servidor.address();
  if (endereco === null || typeof endereco === 'string') {
    throw new Error('Servidor sem porta atribuida');
  }
  return endereco.port;
}

interface Contexto {
  raizUi: string;
  api: ManipuladoresApi;
  token: string;
  porta: () => number;
}

async function tratar(req: IncomingMessage, res: ServerResponse, ctx: Contexto): Promise<void> {
  // Defesa contra DNS rebinding, antes de qualquer roteamento.
  if (!hostEhPermitido(req.headers.host, ctx.porta())) {
    responderJson(res, 403, { erro: 'Host nao permitido' });
    return;
  }

  const url = new URL(req.url ?? '/', `http://127.0.0.1:${ctx.porta()}`);
  const rota = url.pathname;

  // A pagina inicial e servida sem token — ela CARREGA o token na querystring
  // para que o JS o use nas chamadas seguintes.
  if (rota === '/' || rota === '/index.html') {
    await servirArquivo(res, ctx.raizUi, 'index.html');
    return;
  }

  if (!rota.startsWith('/api/')) {
    await servirEstatico(res, ctx.raizUi, rota);
    return;
  }

  // Toda rota de API exige o token.
  const recebido = req.headers['x-token'];
  const doHeader = Array.isArray(recebido) ? recebido[0] : recebido;
  const doQuery = url.searchParams.get('t') ?? undefined;

  if (!tokenConfere(doHeader ?? doQuery, ctx.token)) {
    responderJson(res, 401, { erro: 'Token invalido' });
    return;
  }

  switch (rota) {
    case '/api/estado':
      responderJson(res, 200, ctx.api.estadoBootstrap());
      return;

    case '/api/sondar': {
      const corpo = await lerJson(req);
      const alvo = (corpo as { url?: unknown }).url;
      if (typeof alvo !== 'string') {
        responderJson(res, 400, { erro: 'Campo url ausente' });
        return;
      }
      responderJson(res, 200, await ctx.api.sondar(alvo));
      return;
    }

    case '/api/baixar': {
      const corpo = await lerJson(req);
      await responderSse(req, res, ctx.api, corpo);
      return;
    }

    default:
      responderJson(res, 404, { erro: 'Rota inexistente' });
  }
}

/**
 * SSE: mantem a conexao aberta e vai empurrando eventos. O `abort` do request
 * cancela o download — fechar a aba nao deixa o yt-dlp rodando sozinho.
 */
async function responderSse(
  req: IncomingMessage,
  res: ServerResponse,
  api: ManipuladoresApi,
  corpo: unknown,
): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const controlador = new AbortController();
  req.on('close', () => controlador.abort());

  const emitir = (evento: string, dado: unknown) => {
    if (res.writableEnded) return;
    res.write(`event: ${evento}\ndata: ${JSON.stringify(dado)}\n\n`);
  };

  try {
    const resultado = await api.baixar(corpo, emitir, controlador.signal);
    emitir('fim', resultado);
  } catch (erro) {
    emitir('erro', { mensagem: erro instanceof Error ? erro.message : String(erro) });
  } finally {
    res.end();
  }
}

async function servirEstatico(res: ServerResponse, raiz: string, rota: string): Promise<void> {
  // Só nomes simples: nada de `..`, nada de caminho absoluto.
  const nome = rota.replace(/^\/+/, '');
  if (nome.includes('..') || nome.includes('\\') || nome.includes('/')) {
    responderJson(res, 404, { erro: 'Nao encontrado' });
    return;
  }
  await servirArquivo(res, raiz, nome);
}

async function servirArquivo(res: ServerResponse, raiz: string, nome: string): Promise<void> {
  // A UI vem do mapa embutido no binario; o disco e so fallback de
  // desenvolvimento. Ver src/ui/ativos.ts — ler do disco em producao servia a
  // pasta de codigo da maquina de BUILD.
  const conteudo = await obterAtivo(nome, raiz);

  if (conteudo === null) {
    responderJson(res, 404, { erro: 'Nao encontrado' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': TIPOS_MIME[extname(nome)] ?? 'application/octet-stream',
    // A UI e local e nunca deve ser embutida em outra pagina.
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:",
  });
  res.end(conteudo);
}

function responderJson(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(texto);
}

/** Corpo legitimo tem algumas centenas de bytes; 64 KB ja e folga larga. */
const LIMITE_CORPO = 64 * 1024;

export class CorpoGrandeDemais extends Error {
  constructor() {
    super('Corpo da requisicao excede o limite');
    this.name = 'CorpoGrandeDemais';
  }
}

async function lerJson(req: IncomingMessage): Promise<unknown> {
  // Rejeitar pelo Content-Length ANTES de ler evita ficar consumindo um corpo
  // que ja sabemos que vamos recusar.
  const declarado = Number(req.headers['content-length'] ?? '0');
  if (Number.isFinite(declarado) && declarado > LIMITE_CORPO) {
    throw new CorpoGrandeDemais();
  }

  const pedacos: Buffer[] = [];
  let tamanho = 0;

  for await (const pedaco of req) {
    const bloco = pedaco as Buffer;
    tamanho += bloco.length;
    if (tamanho > LIMITE_CORPO) throw new CorpoGrandeDemais();
    pedacos.push(bloco);
  }

  if (pedacos.length === 0) return {};
  return JSON.parse(Buffer.concat(pedacos).toString('utf8'));
}

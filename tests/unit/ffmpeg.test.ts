/**
 * Bootstrap do ffmpeg sem tocar na rede real.
 *
 * O pin e injetavel (`PinFfmpeg`), entao os testes servem um zip de mentira por
 * um servidor local. Isso permite exercitar o caminho INTEIRO — download,
 * hash, extracao por tar.exe, copia para o cache — em milissegundos, em vez de
 * baixar 106 MB para descobrir que o glob de extracao estava errado.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { garantirFfmpeg, PIN_PADRAO, type PinFfmpeg } from '../../src/bootstrap/ffmpeg.ts';
import { resolverCaminhos } from '../../src/bootstrap/paths.ts';
import { ErroDeIntegridade } from '../../src/bootstrap/hash.ts';

const raiz = join(tmpdir(), 'ytdl-teste-ffmpeg');

/** Monta um zip com a MESMA estrutura do pacote real: `<pasta>/bin/<exe>`. */
async function montarZip(nomes: string[], conteudo = 'binario de mentira'): Promise<Buffer> {
  const trabalho = await mkdtemp(join(tmpdir(), 'ytdl-zip-'));
  const pacote = join(trabalho, 'ffmpeg-0.0.0-essentials_build');
  await mkdir(join(pacote, 'bin'), { recursive: true });
  // `doc/` existe no pacote real e NAO deve ser extraido — se o glob estiver
  // largo demais, ele aparece no destino e o teste de conteudo acusa.
  await mkdir(join(pacote, 'doc'), { recursive: true });
  await writeFile(join(pacote, 'doc', 'leiame.txt'), 'nao deveria ser extraido');
  for (const nome of nomes) {
    await writeFile(join(pacote, 'bin', nome), `${conteudo} :: ${nome}`);
  }

  const zip = join(trabalho, 'pacote.zip');
  const tar = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe');
  await new Promise<void>((ok, falhou) => {
    const filho = spawn(
      tar,
      ['-a', '-cf', zip, '-C', trabalho, 'ffmpeg-0.0.0-essentials_build'],
      { shell: false, windowsHide: true },
    );
    filho.on('error', falhou);
    filho.on('close', (c) => (c === 0 ? ok() : falhou(new Error(`tar -c falhou: ${c}`))));
  });

  const bytes = await readFile(zip);
  await rm(trabalho, { recursive: true, force: true });
  return bytes;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('garantirFfmpeg', () => {
  let servidor: Server;
  let base: string;
  let corpo: Buffer;
  let pedidos = 0;

  beforeAll(async () => {
    corpo = await montarZip(['ffmpeg.exe', 'ffprobe.exe']);

    servidor = createServer((req, res) => {
      pedidos += 1;
      if (req.url === '/vazio') {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-length': String(corpo.length) }).end(corpo);
    });
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await rm(raiz, { recursive: true, force: true });
  });

  async function cacheFrio(): Promise<ReturnType<typeof resolverCaminhos>> {
    return resolverCaminhos(await mkdtemp(join(tmpdir(), 'ytdl-cache-')));
  }

  function pin(extra: Partial<PinFfmpeg> = {}): PinFfmpeg {
    return { url: `${base}/ffmpeg.zip`, sha256: sha256(corpo), rotulo: 'teste.zip', ...extra };
  }

  it('baixa, extrai e deixa os dois binarios no cache', async () => {
    const caminhos = await cacheFrio();
    await garantirFfmpeg({ caminhos, pin: pin() });

    const noCache = await readdir(caminhos.ffmpegDir);
    expect(noCache.sort()).toEqual(['ffmpeg.exe', 'ffprobe.exe']);
  });

  it('extrai SO os binarios — nao despeja doc/ no cache', async () => {
    // O pacote real traz doc/, presets/ e ffplay.exe. Extrair tudo gravaria
    // centenas de MB para apagar depois.
    const caminhos = await cacheFrio();
    await garantirFfmpeg({ caminhos, pin: pin() });

    expect(await readdir(caminhos.ffmpegDir)).not.toContain('leiame.txt');
  });

  it('preserva o conteudo do binario extraido', async () => {
    const caminhos = await cacheFrio();
    await garantirFfmpeg({ caminhos, pin: pin() });

    const lido = await readFile(join(caminhos.ffmpegDir, 'ffprobe.exe'), 'utf8');
    expect(lido).toContain('ffprobe.exe');
  });

  it('e idempotente: com o cache quente nao faz request nenhum', async () => {
    const caminhos = await cacheFrio();
    await garantirFfmpeg({ caminhos, pin: pin() });

    const antes = pedidos;
    await garantirFfmpeg({ caminhos, pin: pin() });
    expect(pedidos).toBe(antes);
  });

  it('reporta progresso com fracao entre 0 e 1', async () => {
    const caminhos = await cacheFrio();
    const fracoes: (number | null)[] = [];
    await garantirFfmpeg({
      caminhos,
      pin: pin(),
      aoMudarEstado: (e) => {
        if (e.fase === 'baixando') fracoes.push(e.fracao);
      },
    });

    expect(fracoes.length).toBeGreaterThan(0);
    for (const f of fracoes) {
      if (f === null) continue;
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

describe('integridade — o cache nunca recebe binario nao verificado', () => {
  let servidor: Server;
  let base: string;
  let corpo: Buffer;

  beforeAll(async () => {
    corpo = await montarZip(['ffmpeg.exe', 'ffprobe.exe']);
    servidor = createServer((_req, res) => {
      res.writeHead(200, { 'content-length': String(corpo.length) }).end(corpo);
    });
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
  });

  it('hash divergente lanca ErroDeIntegridade', async () => {
    const caminhos = resolverCaminhos(await mkdtemp(join(tmpdir(), 'ytdl-cache-')));
    await expect(
      garantirFfmpeg({
        caminhos,
        pin: { url: `${base}/x.zip`, sha256: 'f'.repeat(64), rotulo: 'adulterado.zip' },
      }),
    ).rejects.toThrow(ErroDeIntegridade);
  });

  it('hash divergente NAO deixa nada no cache', async () => {
    // O ponto de todo o fluxo por diretorio temporario: um pacote adulterado
    // (ou um download cortado no meio) nao pode virar um ffmpeg.exe que o app
    // vai executar depois achando que esta tudo bem.
    const caminhos = resolverCaminhos(await mkdtemp(join(tmpdir(), 'ytdl-cache-')));
    await garantirFfmpeg({
      caminhos,
      pin: { url: `${base}/x.zip`, sha256: 'f'.repeat(64), rotulo: 'adulterado.zip' },
    }).catch(() => {});

    await expect(readdir(caminhos.ffmpegDir)).rejects.toThrow(); // nem o diretorio foi criado
  });

  it('HTTP de erro vira falha explicita, nunca cache vazio silencioso', async () => {
    const caminhos = resolverCaminhos(await mkdtemp(join(tmpdir(), 'ytdl-cache-')));
    const morto = createServer((_r, res) => res.writeHead(500).end());
    await new Promise<void>((ok) => morto.listen(0, '127.0.0.1', ok));
    const porta = (morto.address() as AddressInfo).port;

    await expect(
      garantirFfmpeg({
        caminhos,
        pin: { url: `http://127.0.0.1:${porta}/x.zip`, sha256: 'a'.repeat(64), rotulo: 'x.zip' },
      }),
    ).rejects.toThrow(/HTTP 500/);

    await new Promise<void>((ok) => morto.close(() => ok()));
  });
});

describe('pacote com estrutura inesperada', () => {
  let servidor: Server;
  let base: string;
  let corpo: Buffer;

  beforeAll(async () => {
    // So ffmpeg.exe: exatamente o caso que o `-x` quebra la na frente, com um
    // erro incompreensivel, se passar batido aqui.
    corpo = await montarZip(['ffmpeg.exe']);
    servidor = createServer((_req, res) => {
      res.writeHead(200, { 'content-length': String(corpo.length) }).end(corpo);
    });
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
  });

  it('zip sem ffprobe falha citando o binario que faltou', async () => {
    const caminhos = resolverCaminhos(await mkdtemp(join(tmpdir(), 'ytdl-cache-')));
    await expect(
      garantirFfmpeg({
        caminhos,
        pin: { url: `${base}/x.zip`, sha256: sha256(corpo), rotulo: 'parcial.zip' },
      }),
    ).rejects.toThrow(/ffprobe\.exe/);
  });

  it('e NAO deixa o ffmpeg.exe orfao no cache', async () => {
    // Copiar em fluxo deixaria 99 MB de lixo para tras. A verificacao acontece
    // toda ANTES da primeira copia.
    const caminhos = resolverCaminhos(await mkdtemp(join(tmpdir(), 'ytdl-cache-')));
    await garantirFfmpeg({
      caminhos,
      pin: { url: `${base}/x.zip`, sha256: sha256(corpo), rotulo: 'parcial.zip' },
    }).catch(() => {});

    await expect(readdir(caminhos.ffmpegDir)).rejects.toThrow();
  });
});

describe('pin padrao', () => {
  it('nao aponta para gyan.dev', () => {
    // Medido: aquele host serve a 0,28 MB/s, o que dava ~10 min de primeira
    // execucao e reprovava o AT-003. Voltar para la e regressao, nao detalhe.
    expect(PIN_PADRAO.url).not.toContain('gyan.dev');
  });

  it('pina uma tag concreta, nunca `latest`', () => {
    // `latest` mudaria debaixo de nos e invalidaria o sha256 sem ninguem
    // tocar no repositorio — o app passaria a recusar o proprio download.
    expect(PIN_PADRAO.url).not.toContain('/latest/');
  });

  it('tem um sha256 de 64 hex — nunca vazio ou placeholder', () => {
    expect(PIN_PADRAO.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

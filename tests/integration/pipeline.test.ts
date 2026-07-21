import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validarUrlYoutube } from '../../src/core/url.ts';
import { sondar } from '../../src/ytdlp/probe.ts';
import { baixar } from '../../src/ytdlp/downloader.ts';
import { resolverCaminhos } from '../../src/bootstrap/paths.ts';
import { ffmpegPresente, existe } from '../../src/bootstrap/deps.ts';
import type { EventoProgresso } from '../../src/core/progress.ts';

/**
 * Testes que falam com o YouTube DE VERDADE.
 *
 * Sao marcados e separados de proposito (DESIGN, Testing Strategy): dependem
 * de rede e podem falhar por AT-008 (rate limit). Nao entram no CI de PR e
 * nao bloqueiam o loop de desenvolvimento.
 *
 * Sao pulados automaticamente se o cache de dependencias nao estiver montado.
 */

const caminhos = resolverCaminhos();

/** Video curto, estavel e de dominio publico — "Me at the zoo", 19s. */
const VIDEO_CURTO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

let temDeps = false;
let destino: string;

beforeAll(async () => {
  temDeps = (await existe(caminhos.ytdlp)) && (await ffmpegPresente(caminhos));
  destino = await mkdtemp(join(tmpdir(), 'ytdl-teste-'));
});

afterAll(async () => {
  if (destino) await rm(destino, { recursive: true, force: true });
});

const executar = promisify(execFile);

/** Le o container e os codecs REAIS do arquivo — nao confia na extensao. */
async function inspecionar(caminho: string) {
  const { stdout } = await executar(
    join(caminhos.ffmpegDir, 'ffprobe.exe'),
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', caminho],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as {
    format: { format_name: string; duration: string };
    streams: Array<{ codec_type: string; codec_name: string; height?: number }>;
  };
}

describe.runIf(process.env['TESTE_REDE'] === '1')('pipeline real contra o YouTube', () => {
  it('pula com aviso claro se o cache nao estiver montado', () => {
    expect(temDeps, 'cache de dependencias ausente — monte antes de rodar').toBe(true);
  });

  it('AT-012: a sonda traz metadados sem baixar nada', async () => {
    const v = validarUrlYoutube(VIDEO_CURTO);
    expect(v.ok).toBe(true);
    if (!v.ok) return;

    const antes = await readdir(destino);
    const r = await sondar(caminhos.ytdlp, v.urlCanonica, caminhos.ffmpegDir);

    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;

    expect(r.metadados.titulo.length).toBeGreaterThan(0);
    expect(r.metadados.duracaoSegundos).toBeGreaterThan(0);
    expect(r.metadados.resolucoes.length).toBeGreaterThan(0);

    // A sonda NAO pode ter criado arquivo nenhum.
    expect(await readdir(destino)).toEqual(antes);
  });

  it('AT-002: audio sai como MP3 de verdade (container e codec conferidos)', async () => {
    const v = validarUrlYoutube(VIDEO_CURTO);
    if (!v.ok) throw new Error('URL de teste invalida');

    const progressos: EventoProgresso[] = [];
    const r = await baixar(
      caminhos.ytdlp,
      {
        urlCanonica: v.urlCanonica,
        formato: 'audio',
        destino,
        ffmpegDir: caminhos.ffmpegDir,
      },
      { aoProgredir: (e) => progressos.push(e) },
    );

    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;

    // O arquivo existe onde o app disse que existe.
    const info = await stat(r.caminhoArquivo);
    expect(info.size).toBeGreaterThan(1000);
    expect(r.caminhoArquivo.endsWith('.mp3')).toBe(true);

    // ...e e MP3 DE VERDADE, nao so um nome terminado em .mp3.
    const sonda = await inspecionar(r.caminhoArquivo);
    const audio = sonda.streams.find((s) => s.codec_type === 'audio');
    expect(audio?.codec_name).toBe('mp3');
    expect(sonda.streams.some((s) => s.codec_type === 'video')).toBe(false);

    // Houve progresso, e o canal de postprocess falou (a conversao MP3).
    expect(progressos.length).toBeGreaterThan(0);
    expect(progressos.some((p) => p.fase === 'postprocess')).toBe(true);
    // Nenhuma fracao pode ser NaN — o bug que o `|0` no template evita.
    expect(progressos.every((p) => p.fracao === null || Number.isFinite(p.fracao))).toBe(true);
  });

  it('AT-001: video sai como MP4 com H.264', async () => {
    const v = validarUrlYoutube(VIDEO_CURTO);
    if (!v.ok) throw new Error('URL de teste invalida');

    const r = await baixar(
      caminhos.ytdlp,
      { urlCanonica: v.urlCanonica, formato: 'video', destino, ffmpegDir: caminhos.ffmpegDir },
      {},
    );

    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;

    const sonda = await inspecionar(r.caminhoArquivo);
    // Container real, nao a extensao.
    expect(sonda.format.format_name).toContain('mp4');

    const video = sonda.streams.find((s) => s.codec_type === 'video');
    expect(video?.codec_name).toBe('h264');
    expect(sonda.streams.some((s) => s.codec_type === 'audio')).toBe(true);
  });

  it('AT-004: resolucao inexistente DEGRADA em vez de falhar', async () => {
    const v = validarUrlYoutube(VIDEO_CURTO);
    if (!v.ok) throw new Error('URL de teste invalida');

    // Este video e de 2005 e nao tem 4K. Com `-f [height<=2160]` falharia;
    // com `-S res:2160` deve entregar a melhor disponivel.
    const r = await baixar(
      caminhos.ytdlp,
      {
        urlCanonica: v.urlCanonica,
        formato: 'video',
        alturaPreferida: 2160,
        destino,
        ffmpegDir: caminhos.ffmpegDir,
      },
      {},
    );

    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;

    const sonda = await inspecionar(r.caminhoArquivo);
    const video = sonda.streams.find((s) => s.codec_type === 'video');
    // Degradou: entregou algo menor que 2160 e NAO falhou.
    expect(video?.height).toBeLessThan(2160);
    expect(video?.height).toBeGreaterThan(0);
  });

  it('AT-006: video inexistente e classificado, nao explode', async () => {
    const r = await sondar(
      caminhos.ytdlp,
      'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      caminhos.ffmpegDir,
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.categoria).toBe('indisponivel');
    // A mensagem da UI nunca carrega stderr cru.
    expect(r.erro.mensagem).not.toContain('ERROR:');
  });
});

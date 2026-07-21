import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Estes testes provam propriedades que o DESIGN cobra e que so sao
 * verificaveis observando a chamada real ao spawn:
 *
 * - AT-005: URL invalida NAO dispara subprocesso nenhum
 * - AT-012: a sonda precede o download e nunca passa --no-simulate
 * - Security: nunca `shell: true`
 */

const spawnEspiao = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnEspiao,
}));

import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { validarUrlYoutube } from '../../src/core/url.ts';
import { montarArgsProbe, montarArgsDownload } from '../../src/core/selectors.ts';
import { executarYtdlp } from '../../src/ytdlp/runner.ts';

/** Processo falso, suficiente para o runner nao explodir. */
function processoFalso(): EventEmitter & Record<string, unknown> {
  const filho = new EventEmitter() as EventEmitter & Record<string, unknown>;
  Object.assign(filho, {
    stdout: Readable.from([]),
    stderr: Object.assign(Readable.from([]), { setEncoding: () => {} }),
    exitCode: null,
    signalCode: null,
    kill: () => {},
  });
  return filho;
}

beforeEach(() => {
  spawnEspiao.mockReset();
  spawnEspiao.mockImplementation(() => {
    const filho = processoFalso();
    setImmediate(() => filho.emit('close', 0));
    return filho;
  });
});

describe('AT-005 — nenhum subprocesso para URL invalida', () => {
  const invalidas = [
    '',
    'banana',
    'javascript:alert(1)',
    'https://vimeo.com/123',
    'https://www.youtube.com/@canal',
    'https://youtube.com.evil.example/watch?v=aBc123_-XyZ',
  ];

  it.each(invalidas)('%j nao chega a spawnar nada', async (entrada) => {
    const validacao = validarUrlYoutube(entrada);

    // O fluxo real so segue para a sonda quando a validacao passa.
    if (validacao.ok) {
      await executarYtdlp('yt-dlp.exe', montarArgsProbe(validacao.urlCanonica, 'C:/ff'));
    }

    expect(validacao.ok).toBe(false);
    expect(spawnEspiao).not.toHaveBeenCalled();
  });
});

describe('Security — spawn nunca usa shell', () => {
  it('passa shell: false explicitamente', async () => {
    await executarYtdlp('yt-dlp.exe', ['--version']);

    expect(spawnEspiao).toHaveBeenCalledOnce();
    const opcoes = spawnEspiao.mock.calls[0]?.[2] as { shell?: boolean };
    expect(opcoes.shell).toBe(false);
  });

  it('passa os argumentos como ARRAY, nao como string concatenada', async () => {
    // Titulo hostil: com shell, isto viraria execucao de comando.
    const hostil = 'https://www.youtube.com/watch?v=aaaaaaaaaaa" & calc.exe & "';
    await executarYtdlp('yt-dlp.exe', ['-J', hostil]);

    const args = spawnEspiao.mock.calls[0]?.[1] as string[];
    expect(Array.isArray(args)).toBe(true);
    // O argumento hostil chega INTEIRO como um elemento — nao foi interpretado.
    expect(args).toContain(hostil);
    expect(args).toHaveLength(2);
  });
});

describe('AT-012 — a sonda simula e precede o download', () => {
  it('a sonda nunca passa --no-simulate; o download sempre passa', () => {
    const probe = montarArgsProbe('https://www.youtube.com/watch?v=aBc123_-XyZ', 'C:/ff');
    const download = montarArgsDownload({
      urlCanonica: 'https://www.youtube.com/watch?v=aBc123_-XyZ',
      formato: 'audio',
      destino: 'C:/out',
      arquivoDeCaminho: 'C:/temp/d.txt',
      ffmpegDir: 'C:/ff',
    });

    expect(probe).not.toContain('--no-simulate');
    expect(probe).toContain('-J');
    expect(download).toContain('--no-simulate');
  });

  it('a ordem real e sonda -> download', async () => {
    const url = 'https://www.youtube.com/watch?v=aBc123_-XyZ';

    await executarYtdlp('yt-dlp.exe', montarArgsProbe(url, 'C:/ff'));
    await executarYtdlp(
      'yt-dlp.exe',
      montarArgsDownload({
        urlCanonica: url,
        formato: 'video',
        destino: 'C:/o',
        ffmpegDir: 'C:/ff',
        arquivoDeCaminho: 'C:/t/d.txt',
      }),
    );

    expect(spawnEspiao).toHaveBeenCalledTimes(2);
    const primeira = spawnEspiao.mock.calls[0]?.[1] as string[];
    const segunda = spawnEspiao.mock.calls[1]?.[1] as string[];

    expect(primeira).toContain('-J');
    expect(primeira).not.toContain('--no-simulate');
    expect(segunda).toContain('--no-simulate');
  });
});

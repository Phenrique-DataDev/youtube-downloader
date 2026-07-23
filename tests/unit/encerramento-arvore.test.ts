import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * AT-011 / AT-105 — encerrar tem de derrubar a ARVORE, nao so o filho direto.
 *
 * Descoberto em 2026-07-23 verificando o SC-3 contra o `.exe` real: o `yt-dlp`
 * gera um subprocesso por formato (video + audio, um neto por formato). O
 * codigo antigo matava so o filho DIRETO; o neto sobrevivia baixando e ainda
 * segurava o stdout herdado, o que travava o `close` do filho e deixava o
 * proprio app zumbi na porta 47821.
 *
 * Por que este teste ESPIONA a chamada em vez de spawnar uma arvore real: uma
 * reproducao com `node` gerando `node` NAO serve — o neto-node morre junto no
 * ambiente de teste, ao contrario do neto-`yt-dlp.exe`, entao passaria com e
 * sem o fix (verificado: a mutacao nao o matava). O que faltava no codigo era
 * chamar o `taskkill /T`; e isso — o gesto, com os argumentos certos — que aqui
 * se cobra. A prova ponta-a-ponta contra o `.exe` real vive no BUILD_REPORT.
 */

const spawnEspiao = vi.hoisted(() => vi.fn());
const execFileEspiao = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnEspiao,
  execFile: execFileEspiao,
}));

import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { executarYtdlp } from '../../src/ytdlp/runner.ts';

/** Processo falso com pid — o pid e o que o taskkill precisa mirar. */
function processoFalso(pid: number): EventEmitter & Record<string, unknown> {
  const filho = new EventEmitter() as EventEmitter & Record<string, unknown>;
  Object.assign(filho, {
    pid,
    stdout: Readable.from([]),
    stderr: Object.assign(Readable.from([]), { setEncoding: () => {} }),
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
  });
  return filho;
}

beforeEach(() => {
  spawnEspiao.mockReset();
  execFileEspiao.mockReset();
});

describe.skipIf(process.platform !== 'win32')('encerrar derruba a arvore (win32)', () => {
  it('ao abortar, dispara taskkill /PID <pid> /T /F — a arvore, nao so o filho', async () => {
    const filho = processoFalso(4242);
    spawnEspiao.mockReturnValue(filho);

    const controle = new AbortController();
    // Nao resolvemos ainda: queremos observar o efeito do abort, nao o fim.
    void executarYtdlp('yt-dlp.exe', ['-x', 'url'], { sinal: controle.signal });

    controle.abort();

    expect(execFileEspiao).toHaveBeenCalledTimes(1);
    const chamada = execFileEspiao.mock.calls[0];
    if (chamada === undefined) throw new Error('taskkill nao foi chamado');
    const [cmd, args, opcoes] = chamada;
    expect(cmd).toBe('taskkill');
    // A ARVORE (`/T`) e a forca (`/F`), mirando o pid do filho.
    expect(args).toEqual(['/PID', '4242', '/T', '/F']);
    // A mesma regra inegociavel do resto do modulo: nunca via shell.
    expect(opcoes).toMatchObject({ shell: false });
  });

  it('encerrarTodosOsProcessos derruba a arvore de cada filho vivo', async () => {
    // Dois downloads em curso => dois taskkill, um por arvore.
    const f1 = processoFalso(111);
    const f2 = processoFalso(222);
    spawnEspiao.mockReturnValueOnce(f1).mockReturnValueOnce(f2);

    void executarYtdlp('yt-dlp.exe', ['a'], {});
    void executarYtdlp('yt-dlp.exe', ['b'], {});

    const { encerrarTodosOsProcessos } = await import('../../src/ytdlp/runner.ts');
    encerrarTodosOsProcessos();

    const pids = execFileEspiao.mock.calls.map((c) => (c[1] as string[])[1]);
    expect(pids).toContain('111');
    expect(pids).toContain('222');
  });

  it('nao mira um processo ja terminado', async () => {
    const filho = processoFalso(999);
    filho.exitCode = 0; // ja saiu
    spawnEspiao.mockReturnValue(filho);

    const controle = new AbortController();
    void executarYtdlp('yt-dlp.exe', ['x'], { sinal: controle.signal });
    controle.abort();

    expect(execFileEspiao).not.toHaveBeenCalled();
  });
});

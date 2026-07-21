/**
 * Execucao de subprocessos do yt-dlp.
 *
 * Regra inegociavel (DESIGN, Security): spawn com ARRAY de argumentos, nunca
 * `shell: true`. Titulo de video com aspas, `&` ou `;` e entrada hostil por
 * construcao — com shell, um titulo bem escolhido vira execucao de comando.
 */

import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';

/**
 * `stdio: ['ignore', 'pipe', 'pipe']` — nao escrevemos nada no stdin do
 * yt-dlp, entao ele e `null`. Este e o tipo exato que o spawn devolve nessa
 * configuracao.
 */
type ProcessoYtdlp = ChildProcessByStdio<null, Readable, Readable>;

export interface ResultadoExecucao {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface OpcoesExecucao {
  /** Chamado para cada linha de stdout, ja separada. */
  aoReceberLinha?: (linha: string) => void;
  /** Aborta a execucao (fechamento do app, cancelamento do usuario). */
  sinal?: AbortSignal;
  /** Limite de tempo. Ausente = sem limite (download longo e legitimo). */
  timeoutMs?: number;
}

/** Processos vivos, para garantir o AT-011: nenhum filho sobrevive ao app. */
const processosVivos = new Set<ProcessoYtdlp>();

export function executarYtdlp(
  binario: string,
  args: readonly string[],
  opcoes: OpcoesExecucao = {},
): Promise<ResultadoExecucao> {
  return new Promise((resolver, rejeitar) => {
    let filho: ProcessoYtdlp;
    try {
      filho = spawn(binario, [...args], {
        // NUNCA `shell: true`. Ver o cabecalho deste arquivo.
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (erro) {
      rejeitar(erro instanceof Error ? erro : new Error(String(erro)));
      return;
    }

    processosVivos.add(filho);

    const pedacosStdout: string[] = [];
    const pedacosStderr: string[] = [];
    let finalizado = false;

    const leitor = createInterface({ input: filho.stdout, crlfDelay: Infinity });
    leitor.on('line', (linha) => {
      pedacosStdout.push(linha);
      opcoes.aoReceberLinha?.(linha);
    });

    filho.stderr.setEncoding('utf8');
    filho.stderr.on('data', (pedaco: string) => {
      pedacosStderr.push(pedaco);
    });

    const temporizador =
      opcoes.timeoutMs === undefined
        ? null
        : setTimeout(() => {
            encerrar(filho);
          }, opcoes.timeoutMs);

    const aoAbortar = () => encerrar(filho);
    opcoes.sinal?.addEventListener('abort', aoAbortar, { once: true });

    const limpar = () => {
      if (temporizador !== null) clearTimeout(temporizador);
      opcoes.sinal?.removeEventListener('abort', aoAbortar);
      processosVivos.delete(filho);
      leitor.close();
    };

    filho.on('error', (erro) => {
      if (finalizado) return;
      finalizado = true;
      limpar();
      rejeitar(erro);
    });

    filho.on('close', (codigo) => {
      if (finalizado) return;
      finalizado = true;
      limpar();
      resolver({
        exitCode: codigo,
        stdout: pedacosStdout.join('\n'),
        stderr: pedacosStderr.join(''),
      });
    });
  });
}

function encerrar(filho: ProcessoYtdlp): void {
  if (filho.exitCode !== null || filho.signalCode !== null) return;
  filho.kill('SIGTERM');
  // No Windows o SIGTERM nem sempre derruba o processo; o SIGKILL depois de
  // um intervalo curto e o que garante o AT-011.
  setTimeout(() => {
    if (filho.exitCode === null && filho.signalCode === null) filho.kill('SIGKILL');
  }, 3000).unref();
}

/**
 * AT-011: chamado no encerramento do app. Sem isto, fechar a janela deixaria
 * downloads em andamento como processos orfaos consumindo banda.
 */
export function encerrarTodosOsProcessos(): void {
  for (const filho of processosVivos) encerrar(filho);
  processosVivos.clear();
}

export function contarProcessosVivos(): number {
  return processosVivos.size;
}

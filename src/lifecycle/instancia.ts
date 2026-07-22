/**
 * Instancia unica.
 *
 * Sem isto, cada execucao do `.exe` sobe o proprio servidor: a porta preferida
 * fica ocupada, o fallback do `EADDRINUSE` escolhe outra, e o processo antigo
 * segue vivo e invisivel. Depois de algumas execucoes a maquina acumula
 * servidores que ninguem sabe que existem — e o link salvo, que aponta para a
 * porta de sempre, passa a cair em qualquer um deles.
 *
 * A deteccao e por HANDSHAKE HTTP, nao por lockfile: um lockfile sobrevive a um
 * crash e passa a mentir ("ja roda" quando nao roda mais), e desfaze-lo com
 * seguranca exige checar PID vivo — mais peca movel do que perguntar
 * diretamente a quem atende na porta.
 */

/** Marcador de identidade. Trocar isto quebra a deteccao entre versoes. */
export const MARCADOR = 'youtube-downloader';

/** Quem atende na porta preferida. */
export type QuemResponde =
  /** Uma instancia nossa, viva. */
  | 'nossa'
  /** Alguem atende, mas nao e o nosso app. */
  | 'terceiro'
  /** Ninguem atende. */
  | 'ninguem';

/**
 * Como o processo foi iniciado. `silencioso` e o modo do autostart (leva 2):
 * ninguem pediu nada, entao nada aparece na tela.
 */
export type Modo = 'explicito' | 'silencioso';

export function detectarModo(argv: readonly string[]): Modo {
  return argv.includes('--silencioso') ? 'silencioso' : 'explicito';
}

/**
 * O corpo de `/api/identidade` e nosso?
 *
 * Confere o marcador em vez de aceitar qualquer 200: um servico alheio na
 * 47821 responderia 200 tambem, e ceder a porta para ele deixaria a pessoa
 * olhando a interface de outro programa (AT-103).
 */
export function ehNossaIdentidade(corpo: unknown): boolean {
  if (typeof corpo !== 'object' || corpo === null) return false;

  return (corpo as { app?: unknown }).app === MARCADOR;
}

/**
 * Abrir o navegador depende de COMO o processo subiu, nao de ja haver outra
 * instancia.
 *
 * Clicar no atalho e um pedido explicito de usar o app agora — atende-lo com
 * silencio faria o duplo-clique parecer quebrado. Ja o autostart nao pediu
 * nada, entao nao pode fazer aparecer aba no login. Ver o desvio consciente do
 * AT-101 registrado no DESIGN.
 */
export function deveAbrirNavegador(modo: Modo): boolean {
  return modo === 'explicito';
}

/**
 * Pergunta quem esta na porta. Nunca lanca: toda falha vira uma resposta.
 *
 * O timeout e curto de proposito. Isto roda no caminho de arranque do caso
 * COMUM (nenhuma instancia viva), onde a espera e puro atraso percebido — o
 * DEFINE pede a decisao em menos de 500 ms.
 */
export async function sondarInstancia(porta: number, timeoutMs = 300): Promise<QuemResponde> {
  let resposta: Response;

  try {
    resposta = await fetch(`http://127.0.0.1:${porta}/api/identidade`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Conexao recusada, timeout, DNS: ninguem util atende.
    return 'ninguem';
  }

  if (!resposta.ok) return 'terceiro';

  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    // Responde, mas nao em JSON: e outra coisa ocupando a porta.
    return 'terceiro';
  }

  return ehNossaIdentidade(corpo) ? 'nossa' : 'terceiro';
}

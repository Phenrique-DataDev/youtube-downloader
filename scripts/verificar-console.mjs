/**
 * Verificacao real do AT-106 — a janela de console some mesmo?
 *
 * A suite roda sob Node, onde `bun:ffi` nao existe e `lifecycle/console.ts` e
 * no-op inteiro. Ou seja: nenhum teste da suite chega a executar `FreeConsole`.
 * O que da para provar sob Node (`paraUtf16`, o contrato "nunca lanca") esta em
 * `tests/unit/lifecycle-console.test.ts`; o EFEITO so se observa aqui.
 *
 * Uso:
 *   bun scripts/verificar-console.mjs
 *
 * Precisa de um console de verdade anexado ao processo — rode num terminal
 * normal do Windows. Sob CI headless, ou redirecionado, pode nao haver janela
 * nenhuma para esconder, e o script diz isso em vez de fingir sucesso.
 */

const SEM_BUN = 2;
const SEM_WINDOWS = 3;
const SEM_JANELA = 4;
const FALHOU = 1;

function relatar(simbolo, texto) {
  console.log(`${simbolo} ${texto}`);
}

if (typeof process.versions.bun !== 'string') {
  relatar('SKIP', 'este script precisa do Bun — `bun:ffi` nao existe sob Node.');
  relatar('', `runtime atual: node ${process.versions.node}`);
  relatar('', 'instale o Bun (https://bun.sh) e rode: bun scripts/verificar-console.mjs');
  // Sai != 0 de proposito: nao verificado NAO e verificado com sucesso.
  process.exit(SEM_BUN);
}

if (process.platform !== 'win32') {
  relatar('SKIP', `FreeConsole e API do Windows; aqui e ${process.platform}.`);
  process.exit(SEM_WINDOWS);
}

const { dlopen, FFIType } = await import('bun:ffi');

const kernel32 = dlopen('kernel32.dll', {
  GetConsoleWindow: { args: [], returns: FFIType.ptr },
});

const janelaAntes = kernel32.symbols.GetConsoleWindow();
relatar('..', `GetConsoleWindow() antes: ${janelaAntes === null ? 'null' : janelaAntes}`);

if (janelaAntes === null) {
  relatar('SKIP', 'nao ha janela de console anexada — nada para esconder.');
  relatar('', 'rode num terminal do Windows, sem redirecionar a saida.');
  process.exit(SEM_JANELA);
}

const { esconderConsole } = await import('../src/lifecycle/console.ts');

const escondeu = await esconderConsole();
const janelaDepois = kernel32.symbols.GetConsoleWindow();

// A partir daqui o console pode ja ter sido liberado e nada mais aparece na
// tela. O veredito vai TAMBEM pelo codigo de saida, que sobrevive a isso.
relatar('..', `esconderConsole() devolveu: ${escondeu}`);
relatar('..', `GetConsoleWindow() depois: ${janelaDepois === null ? 'null' : janelaDepois}`);

if (escondeu && janelaDepois === null) {
  relatar('OK', 'AT-106 verificado: a janela sumiu de fato.');
  process.exit(0);
}

relatar('FALHA', 'a janela NAO sumiu — AT-106 nao esta entregue neste ambiente.');
process.exit(FALHOU);

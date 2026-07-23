/**
 * Janela de console: esconder no sucesso, gritar no fracasso.
 *
 * O `.exe` nasce com subsistema CONSOLE, entao o Windows lhe da uma janela
 * preta que a pessoa nao entende e nao ousa fechar. O caminho documentado para
 * evita-la — `bun build --compile --windows-hide-console` — NAO FUNCIONA:
 * verificado em Bun 1.3.14, com e sem `--target`, o cabecalho PE saiu
 * `SUBSYSTEM=3` nos dois casos, igual ao binario sem o flag. Bug aberto no
 * upstream (oven-sh/bun#19916).
 *
 * Entao a janela e dispensada em RUNTIME, via `FreeConsole()`. Isso e melhor
 * que o flag por um motivo pratico: como nao depende de como o binario foi
 * compilado, nao restringe o cross-compile Linux->Windows que a CI de release
 * vai precisar — o flag, pela propria doc do Bun, restringe.
 *
 * ## O preco: liberar o console apaga o `console.log`/`console.error`
 *
 * Depois do `FreeConsole` nao ha mais para onde escrever. Por isso a ordem
 * importa e esta amarrada em `main.ts`: so se esconde a janela DEPOIS que o
 * servidor subiu. Falha anterior a isso vai para uma caixa de dialogo nativa
 * (`avisarFalhaFatal`), que persiste na tela — imprimir no console nao serviria
 * nem antes, porque a janela fecha junto com o processo e a mensagem so
 * piscaria.
 *
 * ## Por que tudo aqui e no-op fora do Bun
 *
 * `bun:ffi` so existe sob o runtime do Bun. O `npm run dev` e a suite inteira
 * rodam sob Node, onde estas funcoes nao devem quebrar nada — em
 * desenvolvimento a janela de console e util, e o teste nao pode depender de
 * uma API que o runner nao tem. A verificacao real roda sob Bun, em
 * `scripts/verificar-console.mjs`.
 */

/** True sob o runtime do Bun — o unico onde `bun:ffi` existe. */
export function ambienteSuportaFfi(): boolean {
  return typeof process.versions.bun === 'string';
}

/**
 * O especificador fica numa variavel de proposito: `import('bun:ffi')` literal
 * faz o TypeScript tentar resolver um modulo que nao existe no ambiente de
 * build, e nao ha `@types` para ele.
 */
async function carregarFfi(): Promise<Record<string, never> | null> {
  const especificador = 'bun:ffi';
  try {
    return (await import(/* @vite-ignore */ especificador)) as Record<string, never>;
  } catch {
    return null;
  }
}

/**
 * Dispensa a janela de console. Devolve true se ela realmente foi liberada.
 *
 * Nunca lanca: e um SHOULD do DEFINE, nao um MUST. Falhar aqui deixa a janela
 * visivel — feio, porem inofensivo —, enquanto derrubar o app por causa disso
 * trocaria um incomodo por uma falha total.
 */
export async function esconderConsole(): Promise<boolean> {
  if (!ambienteSuportaFfi()) return false;

  const ffi = await carregarFfi();
  if (ffi === null) return false;

  try {
    const { dlopen, FFIType } = ffi as unknown as {
      dlopen: (
        caminho: string,
        simbolos: Record<string, unknown>,
      ) => { symbols: { FreeConsole: () => number; GetConsoleWindow: () => unknown } };
      FFIType: Record<string, unknown>;
    };

    const kernel32 = dlopen('kernel32.dll', {
      FreeConsole: { args: [], returns: FFIType.i32 },
      GetConsoleWindow: { args: [], returns: FFIType.ptr },
    });

    kernel32.symbols.FreeConsole();
    // Confere o efeito em vez de confiar no retorno: o que interessa e a
    // janela ter sumido, nao a chamada ter dito que sim.
    return kernel32.symbols.GetConsoleWindow() === null;
  } catch {
    return false;
  }
}

/**
 * Caixa de dialogo nativa para falha de arranque.
 *
 * Sem isto, um `.exe` que falha ao subir simplesmente nao abre — sem janela,
 * sem mensagem, sem nada. Para o publico deste app (poucas pessoas, sem
 * experiencia tecnica, sem a quem recorrer) isso e o pior modo de falha
 * possivel: nao ha sequer um sintoma para relatar.
 *
 * `MB_ICONERROR | MB_SETFOREGROUND` = 0x10 | 0x10000.
 */
export async function avisarFalhaFatal(titulo: string, mensagem: string): Promise<boolean> {
  if (!ambienteSuportaFfi()) return false;

  const ffi = await carregarFfi();
  if (ffi === null) return false;

  try {
    const { dlopen, FFIType } = ffi as unknown as {
      dlopen: (
        caminho: string,
        simbolos: Record<string, unknown>,
      ) => {
        symbols: {
          MessageBoxW: (
            janela: null,
            texto: Uint8Array,
            titulo: Uint8Array,
            estilo: number,
          ) => number;
        };
      };
      FFIType: Record<string, unknown>;
    };

    const user32 = dlopen('user32.dll', {
      MessageBoxW: {
        args: [FFIType.ptr, FFIType.cstring, FFIType.cstring, FFIType.u32],
        returns: FFIType.i32,
      },
    });

    user32.symbols.MessageBoxW(null, paraUtf16(mensagem), paraUtf16(titulo), 0x10 | 0x10000);
    return true;
  } catch {
    return false;
  }
}

/**
 * `MessageBoxW` e a variante wide: espera UTF-16LE terminado em NUL. Passar
 * UTF-8 aqui renderiza caixa vazia ou lixo — e o texto de erro em portugues
 * tem acento em praticamente toda frase.
 */
export function paraUtf16(texto: string): Uint8Array {
  const bytes = new Uint8Array((texto.length + 1) * 2);
  const visao = new DataView(bytes.buffer);

  for (let i = 0; i < texto.length; i += 1) {
    visao.setUint16(i * 2, texto.charCodeAt(i), true);
  }
  // Terminador NUL — sem ele a API le memoria alem do texto.
  visao.setUint16(texto.length * 2, 0, true);

  return bytes;
}

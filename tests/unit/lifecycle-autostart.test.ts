import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * O `reg.exe` e mockado em TODOS os testes deste arquivo, sem excecao. Escrever
 * no registro de verdade deixaria residuo na maquina de quem roda a suite — e
 * um teste que liga o autostart do proprio desenvolvedor e um teste que causa
 * dano, nao que prova comportamento.
 */
const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ execFile: execFileMock }));

import {
  CHAVE_RUN,
  NOME_VALOR,
  montarComando,
  autostartLigado,
  ligarAutostart,
  desligarAutostart,
  alternarAutostart,
} from '../../src/lifecycle/autostart.ts';

/** Chave de teste — nunca a real, mesmo com o `reg.exe` mockado. */
const CHAVE_TESTE = 'HKCU\\Software\\youtube-downloader-teste\\Run';

interface Resposta {
  codigo: number;
  stdout?: string;
}

/**
 * Programa as respostas do `reg.exe` na ordem das chamadas. Varias funcoes do
 * modulo chamam o `reg` mais de uma vez (desligar relê, alternar relê de novo),
 * e a ORDEM e justamente o que esses casos precisam provar.
 */
function programarReg(...respostas: Resposta[]): void {
  for (const { codigo, stdout } of respostas) {
    execFileMock.mockImplementationOnce(
      (
        _arquivo: string,
        _argumentos: string[],
        _opcoes: unknown,
        callback: (erro: Error | null, stdout: string, stderr: string) => void,
      ) => {
        // O `execFile` entrega um Error com `.code` = codigo de saida. Um
        // codigo != 0 NAO significa aqui que algo deu errado — ver o teste do
        // valor ausente.
        const erro = codigo === 0 ? null : Object.assign(new Error('reg falhou'), { code: codigo });
        callback(erro, stdout ?? '', '');
      },
    );
  }
}

/** Os argumentos da n-esima invocacao do `reg.exe` (0-based). */
function argumentosDaChamada(n: number): string[] {
  const chamada = execFileMock.mock.calls[n] as [string, string[], unknown, unknown] | undefined;
  if (chamada === undefined) throw new Error(`o reg.exe nao foi chamado ${n + 1} vez(es)`);
  return chamada[1];
}

/** Uma saida de `reg query` como o Windows a imprime de verdade. */
function saidaDeQuery(comando = 'C:\\App\\youtube-downloader.exe --silencioso'): string {
  return `\r\n${CHAVE_TESTE}\r\n    ${NOME_VALOR}    REG_SZ    ${comando}\r\n\r\n`;
}

beforeEach(() => {
  execFileMock.mockReset();
});

describe('montarComando', () => {
  /**
   * O caso que quebra na vida real: `C:\Users\Ana Paula\...`. Sem aspas o
   * Windows executa `C:\Users\Ana` e trata `Paula\...` como argumento — o
   * autostart falha em silencio no login, que e o pior lugar para falhar.
   */
  it('envolve em aspas o caminho com espaco', () => {
    const comando = montarComando('C:\\Users\\Ana Paula\\App\\youtube-downloader.exe');

    expect(comando).toBe('"C:\\Users\\Ana Paula\\App\\youtube-downloader.exe" --silencioso');
  });

  it('cita tambem o caminho sem espaco — a regra nao depende do caminho do dia', () => {
    expect(montarComando('C:\\App\\yd.exe')).toBe('"C:\\App\\yd.exe" --silencioso');
  });

  /**
   * `--silencioso` e o que faz o app subir servindo mas sem abrir aba. Perde-lo
   * transforma o autostart no oposto do requisito: uma aba surgindo sozinha a
   * cada login.
   */
  it('sempre leva --silencioso, e no fim', () => {
    const comando = montarComando('C:\\App\\yd.exe');

    expect(comando.endsWith(' --silencioso')).toBe(true);
  });
});

describe('autostartLigado', () => {
  it('valor presente => ligado', async () => {
    programarReg({ codigo: 0, stdout: saidaDeQuery() });

    expect(await autostartLigado(CHAVE_TESTE)).toBe(true);
  });

  /**
   * A sutileza central deste modulo. `reg query` sai com codigo 1 quando o
   * valor nao existe — e isso e a RESPOSTA "nao esta ligado", nao uma falha.
   * Tratar como excecao faria o caminho mais comum (autostart desligado, que e
   * o default) parecer erro para a UI.
   */
  it('codigo 1 do reg query e RESPOSTA "desligado", nao erro', async () => {
    programarReg({ codigo: 1, stdout: '' });

    await expect(autostartLigado(CHAVE_TESTE)).resolves.toBe(false);
  });

  it('nao lanca quando o reg query falha', async () => {
    programarReg({ codigo: 1, stdout: '' });

    // Explicito porque o `resolves` acima passaria mesmo se a promessa
    // rejeitasse por um caminho que o Vitest engolisse.
    let lancou = false;
    try {
      await autostartLigado(CHAVE_TESTE);
    } catch {
      lancou = true;
    }
    expect(lancou).toBe(false);
  });

  /**
   * Codigo 0 sozinho nao basta: `reg query` de uma chave que existe mas nao tem
   * o NOSSO valor tambem sai 0. Sem conferir o conteudo, qualquer chave
   * povoada por outro programa viraria "ligado".
   */
  it('codigo 0 mas sem o nosso valor na saida => desligado', async () => {
    programarReg({ codigo: 0, stdout: '    OutroPrograma    REG_SZ    C:\\outro.exe\r\n' });

    expect(await autostartLigado(CHAVE_TESTE)).toBe(false);
  });

  it('consulta a chave pedida, com o nome do valor', async () => {
    programarReg({ codigo: 0, stdout: saidaDeQuery() });
    await autostartLigado(CHAVE_TESTE);

    expect(argumentosDaChamada(0)).toEqual(['query', CHAVE_TESTE, '/v', NOME_VALOR]);
  });
});

describe('ligarAutostart', () => {
  it('grava o comando com --silencioso sob o nome esperado', async () => {
    programarReg({ codigo: 0, stdout: '' });
    await ligarAutostart('C:\\Users\\Ana Paula\\yd.exe', CHAVE_TESTE);

    expect(argumentosDaChamada(0)).toEqual([
      'add',
      CHAVE_TESTE,
      '/v',
      NOME_VALOR,
      '/t',
      'REG_SZ',
      '/d',
      '"C:\\Users\\Ana Paula\\yd.exe" --silencioso',
      '/f',
    ]);
  });

  it('devolve false quando o reg.exe falha', async () => {
    programarReg({ codigo: 1, stdout: '' });

    expect(await ligarAutostart('C:\\App\\yd.exe', CHAVE_TESTE)).toBe(false);
  });
});

describe('desligarAutostart', () => {
  it('remove o valor da chave pedida', async () => {
    programarReg({ codigo: 0, stdout: '' });
    await desligarAutostart(CHAVE_TESTE);

    expect(argumentosDaChamada(0)).toEqual(['delete', CHAVE_TESTE, '/v', NOME_VALOR, '/f']);
  });

  /**
   * `reg delete` de um valor que nao existe sai != 0. Mas o estado desejado
   * (desligado) JA vale — reportar falha faria a UI dizer "nao consegui
   * desligar" sobre algo que nunca esteve ligado.
   */
  it('ja estar ausente conta como sucesso', async () => {
    programarReg(
      { codigo: 1, stdout: '' }, // delete falhou
      { codigo: 1, stdout: '' }, // releitura: nao esta la mesmo
    );

    expect(await desligarAutostart(CHAVE_TESTE)).toBe(true);
  });

  it('delete falha e o valor CONTINUA la => false', async () => {
    programarReg(
      { codigo: 1, stdout: '' }, // delete falhou
      { codigo: 0, stdout: saidaDeQuery() }, // releitura: continua ligado
    );

    expect(await desligarAutostart(CHAVE_TESTE)).toBe(false);
  });
});

/**
 * O contrato que a UI depende: o retorno e o estado RELIDO do registro, nunca o
 * desejado. Confirmar uma mudanca que nao aconteceu deixaria a pessoa com um
 * botao dizendo "ligado" e um app que nao sobe no login — e sem nenhuma pista
 * de que os dois discordam.
 */
describe('alternarAutostart devolve o estado relido', () => {
  it('ligar com sucesso => true', async () => {
    programarReg(
      { codigo: 0, stdout: '' }, // add
      { codigo: 0, stdout: saidaDeQuery() }, // releitura
    );

    expect(await alternarAutostart(true, 'C:\\App\\yd.exe', CHAVE_TESTE)).toBe(true);
  });

  it('desligar com sucesso => false', async () => {
    programarReg(
      { codigo: 0, stdout: '' }, // delete
      { codigo: 1, stdout: '' }, // releitura: sumiu
    );

    expect(await alternarAutostart(false, 'C:\\App\\yd.exe', CHAVE_TESTE)).toBe(false);
  });

  /** Pediu LIGAR, a gravacao falhou: tem de devolver false, nao o pedido. */
  it('gravacao falha => devolve o relido (false), nao o desejado (true)', async () => {
    programarReg(
      { codigo: 1, stdout: '' }, // add falhou
      { codigo: 1, stdout: '' }, // releitura: nao ficou nada
    );

    expect(await alternarAutostart(true, 'C:\\App\\yd.exe', CHAVE_TESTE)).toBe(false);
  });

  /** E o inverso: pediu DESLIGAR, a remocao falhou, continua ligado. */
  it('remocao falha => devolve o relido (true), nao o desejado (false)', async () => {
    programarReg(
      { codigo: 1, stdout: '' }, // delete falhou
      { codigo: 0, stdout: saidaDeQuery() }, // releitura dentro do desligar
      { codigo: 0, stdout: saidaDeQuery() }, // releitura do alternar
    );

    expect(await alternarAutostart(false, 'C:\\App\\yd.exe', CHAVE_TESTE)).toBe(true);
  });

  it('a releitura acontece DEPOIS da escrita, e e um query', async () => {
    programarReg({ codigo: 0, stdout: '' }, { codigo: 0, stdout: saidaDeQuery() });
    await alternarAutostart(true, 'C:\\App\\yd.exe', CHAVE_TESTE);

    expect(execFileMock).toHaveBeenCalledTimes(2);
    expect(argumentosDaChamada(0)[0]).toBe('add');
    expect(argumentosDaChamada(1)[0]).toBe('query');
  });
});

/**
 * Invariantes de seguranca do modulo. Cada uma e uma linha em `autostart.ts` —
 * o tipo de defesa que some num refactor distraido e so reaparece quando o
 * caminho de alguem tem espaco, ou quando o app pede elevacao no login.
 */
describe('invariantes de invocacao', () => {
  it('sempre chama reg.exe com ARRAY de argumentos e shell:false', async () => {
    programarReg({ codigo: 0, stdout: '' }, { codigo: 0, stdout: saidaDeQuery() });
    await alternarAutostart(true, 'C:\\Users\\Ana Paula\\yd.exe', CHAVE_TESTE);

    for (const [arquivo, argumentos, opcoes] of execFileMock.mock.calls) {
      expect(arquivo).toBe('reg.exe');
      expect(Array.isArray(argumentos)).toBe(true);
      // shell:true reintroduziria interpretacao de metacaractere num comando
      // que carrega caminho vindo do ambiente.
      expect((opcoes as { shell?: boolean }).shell).toBe(false);
    }
  });

  /**
   * HKLM exigiria administrador. Pedir elevacao a alguem sem experiencia
   * tecnica, no login, para ligar uma conveniencia, e desproporcional — e a
   * pessoa provavelmente recusaria sem entender o que foi perguntado.
   */
  it('a chave padrao e HKCU, nunca HKLM', () => {
    expect(CHAVE_RUN.startsWith('HKCU\\')).toBe(true);
    expect(CHAVE_RUN).not.toContain('HKLM');
    expect(CHAVE_RUN).toBe('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run');
  });

  it('nenhum teste deste arquivo tocou a chave real', async () => {
    programarReg({ codigo: 0, stdout: saidaDeQuery() });
    await autostartLigado(CHAVE_TESTE);

    for (const [, argumentos] of execFileMock.mock.calls) {
      expect(argumentos as string[]).not.toContain(CHAVE_RUN);
    }
  });
});

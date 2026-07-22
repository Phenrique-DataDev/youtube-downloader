/**
 * Iniciar com o Windows — opt-in, reversivel, sem elevacao.
 *
 * Grava um valor em `HKCU\...\Run`. HKCU e nao HKLM de proposito: HKLM exigiria
 * privilegio de administrador para um app que roda no espaco do proprio
 * usuario, e pedir elevacao a alguem sem experiencia tecnica para ligar uma
 * conveniencia e desproporcional.
 *
 * O comando gravado leva `--silencioso`, que faz o app subir servindo mas SEM
 * abrir aba: ninguem pediu nada no login, entao nada aparece na tela.
 *
 * `reg.exe` em vez de biblioteca de registro: e CLI do proprio sistema, ja
 * instalada, e a camada de acesso ao registro que precisariamos escrever seria
 * maior que o uso. Sempre com ARRAY de argumentos e `shell: false` — a mesma
 * regra inegociavel do `ytdlp/runner.ts`, e aqui vale igual: o caminho do
 * executavel contem espacos e vem do ambiente.
 */

import { execFile } from 'node:child_process';

/** Onde o Windows procura o que iniciar no login do usuario atual. */
export const CHAVE_RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

/** Nome do valor. Trocar isto deixa orfao o valor gravado por versoes antigas. */
export const NOME_VALOR = 'youtube-downloader';

interface Saida {
  codigo: number;
  stdout: string;
}

function reg(argumentos: readonly string[]): Promise<Saida> {
  return new Promise((resolver) => {
    execFile('reg.exe', [...argumentos], { shell: false }, (erro, stdout) => {
      // `reg query` sai com codigo 1 quando o valor nao existe. Isso e uma
      // RESPOSTA ("nao esta ligado"), nao um erro — tratar como excecao faria
      // o caminho normal parecer falha.
      const codigo = erro === null ? 0 : ((erro as { code?: number }).code ?? 1);
      resolver({ codigo, stdout: stdout.toString() });
    });
  });
}

/** O comando que o Windows executa no login. */
export function montarComando(caminhoExecutavel: string): string {
  // Aspas porque o caminho quase sempre tem espaco (`C:\Program Files\...`,
  // `C:\Users\Nome Sobrenome\...`). Sem elas o Windows executa o primeiro
  // pedaco e trata o resto como argumento.
  return `"${caminhoExecutavel}" --silencioso`;
}

export async function autostartLigado(chave: string = CHAVE_RUN): Promise<boolean> {
  const { codigo, stdout } = await reg(['query', chave, '/v', NOME_VALOR]);

  return codigo === 0 && stdout.includes(NOME_VALOR);
}

export async function ligarAutostart(
  caminhoExecutavel: string,
  chave: string = CHAVE_RUN,
): Promise<boolean> {
  const { codigo } = await reg([
    'add',
    chave,
    '/v',
    NOME_VALOR,
    '/t',
    'REG_SZ',
    '/d',
    montarComando(caminhoExecutavel),
    '/f',
  ]);

  return codigo === 0;
}

export async function desligarAutostart(chave: string = CHAVE_RUN): Promise<boolean> {
  const { codigo } = await reg(['delete', chave, '/v', NOME_VALOR, '/f']);

  // Ja estar ausente e sucesso: o estado desejado (desligado) foi alcancado.
  return codigo === 0 || !(await autostartLigado(chave));
}

/**
 * Alterna e devolve o estado RELIDO do registro — nunca o presumido.
 *
 * Se o `reg.exe` falhar, a UI precisa mostrar o que de fato ficou gravado, e
 * nao confirmar uma mudanca que nao aconteceu.
 */
export async function alternarAutostart(
  desejado: boolean,
  caminhoExecutavel: string,
  chave: string = CHAVE_RUN,
): Promise<boolean> {
  if (desejado) await ligarAutostart(caminhoExecutavel, chave);
  else await desligarAutostart(chave);

  return autostartLigado(chave);
}

/**
 * Tratamento de falha fatal de arranque — AT-107.
 *
 * Quando o app nao consegue nem subir (porta inutilizavel, dependencia
 * corrompida), a pessoa nao pode ficar sem sintoma: `console.error` sozinho so
 * pisca — a janela fecha junto com o processo, e se o console ja foi liberado
 * (`FreeConsole`), nem pisca. Uma caixa nativa (`MessageBoxW`) PERSISTE na tela
 * ate ser fechada. Para o publico deste app — poucas pessoas, sem experiencia,
 * sem a quem recorrer — saida silenciosa e o pior modo de falha possivel.
 *
 * A logica vive AQUI, e nao no `catch` de nivel de modulo do `main.ts`, por um
 * motivo de verificacao: o `catch` la roda no import e nao ha como testa-lo sem
 * subir o app. Isolada e com as dependencias INJETADAS, o AT-107 vira um teste
 * de verdade — prova que a caixa e chamada, e chamada ANTES do `exit(1)`, sem
 * abrir caixa nenhuma no CI.
 */

export interface DepsFalhaFatal {
  /** Mostra a caixa nativa persistente. Em producao: `avisarFalhaFatal`. */
  avisar: (titulo: string, mensagem: string) => Promise<boolean>;
  /** Registra no log de arquivo. Em producao: o `registrar` do main. */
  registrar: (evento: string, detalhe: string) => Promise<void>;
  /** Encerra o processo. Em producao: `process.exit`. */
  sair: (codigo: number) => void;
}

/** Titulo da caixa — o nome que a pessoa reconhece. */
export const TITULO_FALHA = 'youtube-downloader';

/** A mensagem que a pessoa le. Instrucao acionavel, sem jargao nem stacktrace cru. */
export function mensagemFalha(detalhe: string): string {
  return `Não consegui iniciar o aplicativo.\n\n${detalhe}\n\nTente executar de novo. Se continuar, reinicie o computador.`;
}

/**
 * Avisa e SO ENTAO encerra. A ordem e o contrato do AT-107: a caixa tem de
 * aparecer antes do processo morrer, senao a mensagem morre junto.
 *
 * Reportar e best-effort e o `exit` e garantido: o `catch` engole qualquer
 * falha de `registrar`/`avisar` (nao pode virar rejeicao pendurada) e o
 * `finally` encerra de todo jeito. Travar TENTANDO reportar a falha seria
 * trocar um erro visivel por um processo pendurado — a mesma disciplina do
 * failsafe de encerramento.
 */
export async function tratarFalhaFatal(erro: unknown, deps: DepsFalhaFatal): Promise<void> {
  const detalhe = erro instanceof Error ? erro.message : String(erro);
  // Fica no log mesmo que a caixa falhe — o log e a segunda via da mensagem.
  console.error('Falha ao iniciar:', detalhe);

  try {
    await deps.registrar('arranque falhou', detalhe);
    await deps.avisar(TITULO_FALHA, mensagemFalha(detalhe));
  } catch {
    // Se ate o aviso falhar, nao ha mais o que reportar — mas o exit abaixo
    // ainda tem de acontecer. A falha aqui nao pode escapar como rejeicao.
  } finally {
    deps.sair(1);
  }
}

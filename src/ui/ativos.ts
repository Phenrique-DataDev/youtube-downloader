/**
 * De onde a UI e servida.
 *
 * Empacotado, o `.exe` nao tem `src/ui/` ao lado — e pior, o bundler assa o
 * `import.meta.url` da maquina de build, entao ler do disco "funciona" no
 * desenvolvimento e serve 404 (ou, pior ainda, a UI do desenvolvedor) em
 * producao. Ver o cabecalho de `scripts/gerar-ativos.mjs`.
 *
 * Por isso a ordem aqui NAO e negociavel: embutido primeiro, disco so como
 * conveniencia de desenvolvimento. Se o mapa gerado tiver o arquivo, ele vence
 * — o binario nunca consulta o disco para servir a UI.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ATIVOS_EMBUTIDOS } from './ativos.gerado.ts';

/**
 * Devolve o conteudo de um arquivo da UI, ou `null` se ele nao existe.
 *
 * `raizUi` e usado apenas no fallback de desenvolvimento; em binario
 * empacotado o mapa embutido sempre responde primeiro.
 */
export async function obterAtivo(nome: string, raizUi: string): Promise<Buffer | null> {
  const embutido = ATIVOS_EMBUTIDOS[nome];
  if (embutido !== undefined) {
    return Buffer.from(embutido, 'base64');
  }

  try {
    return await readFile(join(raizUi, nome));
  } catch {
    return null;
  }
}

/** True quando o build embutiu a UI — usado pelo smoke test do empacotamento. */
export function temAtivosEmbutidos(): boolean {
  return Object.keys(ATIVOS_EMBUTIDOS).length > 0;
}

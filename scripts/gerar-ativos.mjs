/**
 * Embute os arquivos da UI num modulo TypeScript, para o `.exe` nao depender de
 * ler `src/ui/` do disco.
 *
 * POR QUE ISTO EXISTE — o bug que ele fecha:
 * `main.ts` resolvia a raiz da UI por `dirname(fileURLToPath(import.meta.url))`.
 * Ao empacotar, o bundler ASSA esse valor: o binario gerado nesta maquina
 * carregava `file:///C:/Users/.../youtube-downloader/src/main.ts` embutido e
 * servia a UI da pasta de codigo do desenvolvedor. Rodava perfeitamente aqui e
 * daria 404 na maquina de qualquer usuario — um teste que passa exatamente onde
 * nao deveria. Medido em 2026-07-21 com Bun e Node SEA.
 *
 * Nao ha versao "de disco" em producao: o binario carrega o que este script
 * gerou, ponto. O fallback vive so no modo de desenvolvimento (ver ativos.ts).
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raizProjeto = join(dirname(fileURLToPath(import.meta.url)), '..');
const dirUi = join(raizProjeto, 'src', 'ui');
const saida = join(dirUi, 'ativos.gerado.ts');

// O `.svg` entra aqui porque o favicon e servido pelo mesmo caminho estatico da
// UI: fora deste filtro ele nao vai para o mapa embutido e o `.exe` responde 404
// para `/favicon.svg` — falha invisivel no desenvolvimento, onde o fallback de
// disco cobre a ausencia. `TIPOS_MIME` (src/server/http.ts) ja mapeia a extensao.
const arquivos = (await readdir(dirUi)).filter((n) => /\.(html|css|js|svg)$/.test(n));

if (arquivos.length === 0) {
  console.error(`FALHOU: nenhum arquivo de UI em ${dirUi}.`);
  process.exitCode = 1;
} else {
  const entradas = [];
  for (const nome of arquivos) {
    const bytes = await readFile(join(dirUi, nome));
    entradas.push(`  ${JSON.stringify(nome)}: ${JSON.stringify(bytes.toString('base64'))},`);
  }

  const conteudo = `// GERADO por scripts/gerar-ativos.mjs — nao editar a mao.
// Regenerado a cada build; ver o cabecalho daquele script para o porque.

export const ATIVOS_EMBUTIDOS: Record<string, string> = {
${entradas.join('\n')}
};
`;

  await writeFile(saida, conteudo, 'utf8');
  const total = entradas.reduce((s, e) => s + e.length, 0);
  console.log(`ativos embutidos: ${arquivos.join(', ')} (${(total / 1024).toFixed(1)} KB base64)`);
}

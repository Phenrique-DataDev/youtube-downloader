/**
 * Empacota o app num `.exe` unico (SC-6).
 *
 * Bun `--compile` foi escolhido por medicao, nao por preferencia — ver
 * docs/adr/0002-empacotamento.md. Node SEA entrega um binario 6% menor e custa
 * 5 passos, uma dependencia a mais (postject) e um runner Windows na CI; a
 * diferenca de tamanho nao compra nada contra um teto que os dois folgam.
 *
 * O gate de tamanho falha o build em vez de avisar: passar de 120 MB e uma
 * decisao de produto (o usuario baixa isto), nao um detalhe que se descobre no
 * Release.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const saida = join(dist, 'youtube-downloader.exe');

/** SC-6. Teto de produto: o usuario baixa este arquivo. */
const LIMITE_MB = 120;

/**
 * Acha o executavel do Bun.
 *
 * `npm i -g bun` instala um shim `bun.cmd`, e `spawn` sem shell nao executa
 * `.cmd` no Windows — o build morria com ENOENT mesmo com o `bun` funcionando
 * no terminal. Resolver o `.exe` real evita cair em `shell: true`, que este
 * projeto nao usa em lugar nenhum.
 */
function resolverBun() {
  const candidatos = [
    process.env.BUN_PATH,
    process.platform === 'win32' ? 'bun.exe' : 'bun',
    process.env.APPDATA && join(process.env.APPDATA, 'npm', 'node_modules', 'bun', 'bin', 'bun.exe'),
  ].filter(Boolean);

  for (const candidato of candidatos) {
    const teste = spawnSync(candidato, ['--version'], { shell: false });
    if (teste.status === 0) return candidato;
  }

  throw new Error(
    'Bun nao encontrado. Instale com `npm i -g bun` (ou https://bun.sh) ' +
      'ou aponte BUN_PATH para o executavel.',
  );
}

async function rodar(comando, argumentos) {
  await new Promise((ok, falhou) => {
    const filho = spawn(comando, argumentos, { cwd: raiz, shell: false, stdio: 'inherit' });
    filho.on('error', falhou);
    filho.on('close', (c) => (c === 0 ? ok() : falhou(new Error(`${comando} saiu com ${c}`))));
  });
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// A UI precisa estar embutida ANTES do bundle: ler do disco em producao servia
// a pasta de codigo da maquina de build. Ver scripts/gerar-ativos.mjs.
console.log('> embutindo a UI');
await rodar(process.execPath, [join(raiz, 'scripts', 'gerar-ativos.mjs')]);

const bun = resolverBun();
console.log(`> compilando (${bun})`);
await rodar(bun, [
  'build',
  '--compile',
  '--target=bun-windows-x64',
  join(raiz, 'src', 'main.ts'),
  '--outfile',
  saida,
]);

const bytes = await readFile(saida);
const mb = bytes.length / 1024 / 1024;
const sha256 = createHash('sha256').update(bytes).digest('hex');

console.log(`\n  ${saida}`);
console.log(`  tamanho : ${mb.toFixed(1)} MB (limite ${LIMITE_MB} MB)`);
console.log(`  sha256  : ${sha256}`);

if (mb > LIMITE_MB) {
  console.error(
    `\nFALHOU: o binario tem ${mb.toFixed(1)} MB e o teto do SC-6 e ${LIMITE_MB} MB.\n` +
      'Nao suba o limite sem decidir que o usuario vai baixar mais que isso.',
  );
  process.exitCode = 1;
}

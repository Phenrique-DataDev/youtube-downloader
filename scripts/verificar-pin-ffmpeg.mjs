/**
 * Vigia o pin do ffmpeg (ver src/bootstrap/ffmpeg.ts).
 *
 * Existe por causa de uma divida conhecida: a URL pinada aponta para uma tag
 * `autobuild-<data>` do BtbN, e essas tags sao PODADAS. Quando isso acontecer,
 * a primeira execucao do app passa a dar 404 — para todo mundo, de uma vez, e
 * meses depois do commit que pinou. Um teste unitario nao pega isso: nada no
 * repositorio muda no dia em que a tag some.
 *
 * Dois modos, porque tem custo diferente:
 *
 *   --disponivel  (default)  HEAD na URL. Barato, roda todo dia. Responde a
 *                            pergunta que importa: "o pin ainda existe?"
 *   --integridade            Baixa os ~167 MB e confere o SHA256. Responde
 *                            "o arquivo continua sendo o mesmo?". Roda quando
 *                            o pin muda, nao diariamente.
 *
 * O pin e LIDO do codigo, nunca copiado para ca: duas copias divergiriam, e a
 * copia errada seria justamente a que o CI verifica.
 */

import { createHash } from 'node:crypto';

const { PIN_PADRAO } = await import('../src/bootstrap/ffmpeg.ts');

const modo = process.argv.includes('--integridade') ? 'integridade' : 'disponivel';

console.log(`pin  : ${PIN_PADRAO.rotulo}`);
console.log(`url  : ${PIN_PADRAO.url}`);
console.log(`modo : ${modo}`);

/**
 * Sempre `process.exitCode`, nunca `process.exit()`: o fetch deixa um socket
 * keep-alive aberto, e sair no meio disso derruba o processo com uma assertion
 * do libuv (127) DEPOIS de ja ter impresso "ok" — o CI leria sucesso como
 * falha. Deixar o loop de eventos drenar sozinho resolve.
 */
if (modo === 'disponivel') {
  // Redirect seguido de proposito: o GitHub serve assets por redirect para o
  // CDN, e um 302 aqui e sucesso, nao falha.
  const resposta = await fetch(PIN_PADRAO.url, { method: 'HEAD' });

  if (resposta.ok) {
    const tamanho = resposta.headers.get('content-length');
    console.log(`\nok: HTTP ${resposta.status}${tamanho ? ` (${tamanho} bytes)` : ''}`);
  } else {
    console.error(
      `\nFALHOU: a URL pinada respondeu HTTP ${resposta.status}.\n` +
        'Se for 404, a tag do BtbN foi podada — era o risco previsto.\n' +
        'Acao: escolher uma release nova, baixar, conferir o hash e atualizar\n' +
        'PIN_PADRAO em src/bootstrap/ffmpeg.ts (ou migrar para Release proprio,\n' +
        'se o repositorio ja for publico — ver docs/adr/0001-fonte-do-ffmpeg.md).',
    );
    process.exitCode = 1;
  }
} else {
  const resposta = await fetch(PIN_PADRAO.url);

  if (!resposta.ok || resposta.body === null) {
    console.error(`\nFALHOU: HTTP ${resposta.status} ao baixar o pacote.`);
    process.exitCode = 1;
  } else {
    const hash = createHash('sha256');
    for await (const pedaco of resposta.body) hash.update(pedaco);
    const obtido = hash.digest('hex');

    if (obtido === PIN_PADRAO.sha256) {
      console.log(`\nok: sha256 confere (${obtido})`);
    } else {
      console.error(
        `\nFALHOU: o conteudo mudou sob a URL pinada.\n` +
          `  esperado: ${PIN_PADRAO.sha256}\n` +
          `  obtido  : ${obtido}\n` +
          'O app RECUSA este download (e correto). Investigar antes de repinar:\n' +
          'um asset que muda sem a tag mudar merece explicacao.',
      );
      process.exitCode = 1;
    }
  }
}

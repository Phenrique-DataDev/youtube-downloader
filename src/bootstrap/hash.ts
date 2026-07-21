/**
 * Verificacao de integridade do que o bootstrap baixa.
 *
 * Regra do DESIGN: verificar SHA256 de TUDO. Um binario adulterado no cache
 * roda com os privilegios do usuario — e o vetor mais serio do produto.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function sha256DoArquivo(caminho: string): Promise<string> {
  const hash = createHash('sha256');
  const fluxo = createReadStream(caminho);
  for await (const pedaco of fluxo) {
    hash.update(pedaco as Buffer);
  }
  return hash.digest('hex');
}

export function sha256DeBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Le um arquivo no formato `SHA2-256SUMS` (`<hash>  <nome>` por linha).
 *
 * A busca e por SUFIXO do nome porque o arquivo lista caminhos como
 * `yt-dlp.exe` mas tambem variantes com prefixo. Se o binario for renomeado no
 * cache, nenhuma linha casa — e ai a verificacao seria PULADA em silencio.
 * Por isso esta funcao devolve null e o chamador trata null como FALHA, nunca
 * como "sem hash para conferir".
 */
export function extrairHashEsperado(conteudoSums: string, nomeArquivo: string): string | null {
  const alvo = nomeArquivo.toLowerCase();

  for (const linha of conteudoSums.split(/\r?\n/)) {
    const texto = linha.trim();
    if (texto.length === 0) continue;

    // Formato: `<hash>  <nome>` ou `<hash> *<nome>` (modo binario).
    const partes = texto.split(/\s+/);
    const hash = partes[0];
    const nome = partes[1];
    if (hash === undefined || nome === undefined) continue;
    if (!/^[0-9a-f]{64}$/i.test(hash)) continue;

    const nomeLimpo = nome.replace(/^\*/, '').toLowerCase();
    if (nomeLimpo === alvo || nomeLimpo.endsWith(`/${alvo}`)) {
      return hash.toLowerCase();
    }
  }

  return null;
}

export class ErroDeIntegridade extends Error {
  // Campos declarados e atribuidos explicitamente: `parameter properties`
  // (`constructor(readonly x)`) nao existem em JavaScript, entao o
  // strip-only do Node — que apaga tipos sem transformar codigo — as rejeita.
  readonly arquivo: string;
  readonly esperado: string | null;
  readonly obtido: string;

  constructor(arquivo: string, esperado: string | null, obtido: string) {
    super(
      esperado === null
        ? `Nao encontrei o checksum de ${arquivo} na lista oficial — download recusado.`
        : `Checksum de ${arquivo} nao confere. Esperado ${esperado}, obtido ${obtido}.`,
    );
    this.name = 'ErroDeIntegridade';
    this.arquivo = arquivo;
    this.esperado = esperado;
    this.obtido = obtido;
  }
}

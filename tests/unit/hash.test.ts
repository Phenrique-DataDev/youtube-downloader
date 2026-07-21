import { describe, it, expect } from 'vitest';
import { extrairHashEsperado, sha256DeBytes, ErroDeIntegridade } from '../../src/bootstrap/hash.ts';
import { SHA2_256SUMS_REAL, HASH_YTDLP_EXE } from '../fixtures/sha256sums.ts';

describe('leitura do SHA2-256SUMS real da release', () => {
  it('encontra o hash de yt-dlp.exe', () => {
    expect(extrairHashEsperado(SHA2_256SUMS_REAL, 'yt-dlp.exe')).toBe(HASH_YTDLP_EXE);
  });

  it('nao confunde yt-dlp.exe com yt-dlp (sem extensao)', () => {
    const semExtensao = extrairHashEsperado(SHA2_256SUMS_REAL, 'yt-dlp');
    expect(semExtensao).not.toBe(HASH_YTDLP_EXE);
    expect(semExtensao).toBe('495be29ff4d9d4e9be7eabdfef225221e5d5282e77f2f505abc6dca80349f3fd');
  });

  it('nao confunde yt-dlp.exe com yt-dlp_arm64.exe', () => {
    // Um `endsWith` ingenuo casaria errado aqui e verificaria o binario x64
    // contra o hash do arm64 — que falharia de forma inexplicavel.
    expect(extrairHashEsperado(SHA2_256SUMS_REAL, 'yt-dlp_arm64.exe')).toBe(
      '1525690b037ecc0bb677e38e7147b0025179cbc9a8d0c57264e3100b18099280',
    );
  });

  it('e insensivel a maiusculas no nome', () => {
    expect(extrairHashEsperado(SHA2_256SUMS_REAL, 'YT-DLP.EXE')).toBe(HASH_YTDLP_EXE);
  });

  it('aceita o formato de modo binario (`hash *nome`)', () => {
    const modoBinario = `${HASH_YTDLP_EXE} *yt-dlp.exe`;
    expect(extrairHashEsperado(modoBinario, 'yt-dlp.exe')).toBe(HASH_YTDLP_EXE);
  });
});

describe('A-008 — renomear o binario NAO pode pular a verificacao', () => {
  it('nome ausente da lista devolve null (e o chamador trata como falha)', () => {
    // Este e o ponto todo do A-008: se o app renomeasse o binario para
    // `ytdlp.exe` ou `yt-dlp-2026.exe`, nenhuma linha casaria. O contrato e
    // devolver null; quem chama DEVE recusar o download, nunca seguir sem
    // conferir.
    expect(extrairHashEsperado(SHA2_256SUMS_REAL, 'ytdlp.exe')).toBeNull();
    expect(extrairHashEsperado(SHA2_256SUMS_REAL, 'yt-dlp-renomeado.exe')).toBeNull();
  });

  it('ErroDeIntegridade com esperado=null diz que o checksum nao foi achado', () => {
    const erro = new ErroDeIntegridade('ytdlp.exe', null, 'abc');
    expect(erro.message).toContain('lista oficial');
    expect(erro.message).toContain('recusado');
  });

  it('ErroDeIntegridade com hash divergente mostra os dois valores', () => {
    const erro = new ErroDeIntegridade('yt-dlp.exe', 'aaa', 'bbb');
    expect(erro.message).toContain('aaa');
    expect(erro.message).toContain('bbb');
  });
});

describe('robustez do parser', () => {
  it('ignora linhas vazias e lixo', () => {
    const sujo = `
# comentario que nao deveria existir mas pode aparecer

${HASH_YTDLP_EXE}  yt-dlp.exe

nao-e-um-hash  yt-dlp.exe
`;
    expect(extrairHashEsperado(sujo, 'yt-dlp.exe')).toBe(HASH_YTDLP_EXE);
  });

  it('devolve null para conteudo vazio — nunca um hash inventado', () => {
    expect(extrairHashEsperado('', 'yt-dlp.exe')).toBeNull();
  });

  it('rejeita linha cujo primeiro campo nao e um sha256 de 64 hex', () => {
    expect(extrairHashEsperado('abc123  yt-dlp.exe', 'yt-dlp.exe')).toBeNull();
  });
});

describe('sha256 de bytes', () => {
  it('produz o digest conhecido de entrada vazia', () => {
    expect(sha256DeBytes(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('produz o digest conhecido de "abc"', () => {
    expect(sha256DeBytes(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

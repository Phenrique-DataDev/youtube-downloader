import { describe, it, expect } from 'vitest';
import { validarUrlYoutube } from '../../src/core/url.ts';

describe('AT-005 — validacao de URL antes de qualquer spawn', () => {
  const validas: Array<[string, string]> = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    // Com sujeira de playlist e timestamp — o caso mais comum no mundo real.
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc&index=2&t=42s', 'dQw4w9WgXcQ'],
    ['  https://youtu.be/dQw4w9WgXcQ?si=xyz  ', 'dQw4w9WgXcQ'],
  ];

  it.each(validas)('aceita %s', (entrada, idEsperado) => {
    const r = validarUrlYoutube(entrada);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.videoId).toBe(idEsperado);
      // A URL canonica descarta playlist/timestamp.
      expect(r.urlCanonica).toBe(`https://www.youtube.com/watch?v=${idEsperado}`);
    }
  });

  it('canonicaliza descartando &list= (protege o AT contra playlist acidental)', () => {
    const r = validarUrlYoutube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz');
    expect(r.ok && r.urlCanonica.includes('list')).toBe(false);
  });

  const invalidas: Array<[string, string]> = [
    ['', 'nao-e-url'],
    ['   ', 'nao-e-url'],
    ['isso nao e um link', 'nao-e-url'],
    ['javascript:alert(1)', 'nao-e-url'],
    ['file:///C:/Windows/System32', 'nao-e-url'],
    ['ftp://youtube.com/watch?v=dQw4w9WgXcQ', 'nao-e-url'],
    ['https://vimeo.com/123456', 'nao-e-youtube'],
    ['https://example.com/watch?v=dQw4w9WgXcQ', 'nao-e-youtube'],
    // Host que apenas CONTEM youtube.com — nao pode passar.
    ['https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'nao-e-youtube'],
    ['https://notyoutube.com/watch?v=dQw4w9WgXcQ', 'nao-e-youtube'],
    ['https://www.youtube.com/', 'sem-video-id'],
    ['https://www.youtube.com/@algumcanal', 'sem-video-id'],
    ['https://www.youtube.com/playlist?list=PLxyz', 'sem-video-id'],
    ['https://www.youtube.com/results?search_query=teste', 'sem-video-id'],
    // Id com tamanho errado — 11 chars e o contrato.
    ['https://www.youtube.com/watch?v=curto', 'sem-video-id'],
    ['https://youtu.be/muitolongodemais123', 'sem-video-id'],
  ];

  it.each(invalidas)('rejeita %s como %s', (entrada, motivoEsperado) => {
    const r = validarUrlYoutube(entrada);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe(motivoEsperado);
      expect(r.mensagem.length).toBeGreaterThan(0);
    }
  });

  it('separa "nao e URL" de "nao e YouTube" — mensagens diferentes', () => {
    const a = validarUrlYoutube('banana');
    const b = validarUrlYoutube('https://vimeo.com/1');
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok && !b.ok) {
      expect(a.motivo).not.toBe(b.motivo);
      expect(a.mensagem).not.toBe(b.mensagem);
    }
  });
});

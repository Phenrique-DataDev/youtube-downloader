import { describe, it, expect } from 'vitest';
import { montarArgsProbe, montarArgsDownload } from '../../src/core/selectors.ts';

const BASE = {
  urlCanonica: 'https://www.youtube.com/watch?v=aBc123_-XyZ',
  destino: 'C:/Users/teste/Downloads',
  ffmpegDir: 'C:/cache/ffmpeg',
  arquivoDeCaminho: 'C:/temp/destino.txt',
};

describe('contrato de invocacao — flags obrigatorias em toda chamada', () => {
  const casos = [
    ['probe', montarArgsProbe(BASE.urlCanonica, BASE.ffmpegDir)],
    ['download video', montarArgsDownload({ ...BASE, formato: 'video' })],
    ['download audio', montarArgsDownload({ ...BASE, formato: 'audio' })],
  ] as const;

  it.each(casos)('%s inclui --ignore-config', (_nome, args) => {
    expect(args).toContain('--ignore-config');
  });

  it.each(casos)('%s inclui --no-playlist', (_nome, args) => {
    expect(args).toContain('--no-playlist');
  });

  it.each(casos)('%s inclui --newline', (_nome, args) => {
    expect(args).toContain('--newline');
  });

  it.each(casos)('%s aponta --ffmpeg-location (nunca depende do PATH)', (_nome, args) => {
    const i = args.indexOf('--ffmpeg-location');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe(BASE.ffmpegDir);
  });

  it.each(casos)('%s NUNCA passa -i/--ignore-errors', (_nome, args) => {
    // Proibido pelo DESIGN: faria o download ser tido como bem-sucedido mesmo
    // com o pos-processamento falhando, quebrando o AT-002.
    expect(args).not.toContain('-i');
    expect(args).not.toContain('--ignore-errors');
  });

  it.each(casos)('%s NUNCA passa --exec (quoting de shell sem ganho)', (_nome, args) => {
    expect(args).not.toContain('--exec');
  });

  it.each(casos)('%s termina com a URL', (_nome, args) => {
    expect(args[args.length - 1]).toBe(BASE.urlCanonica);
  });
});

describe('AT-012 — a sonda simula, nao baixa', () => {
  const args = montarArgsProbe(BASE.urlCanonica, BASE.ffmpegDir);

  it('usa -J', () => {
    expect(args).toContain('-J');
  });

  it('NUNCA passa --no-simulate (seria o oposto de sondar)', () => {
    expect(args).not.toContain('--no-simulate');
  });

  it('falha rapido: retries baixo e timeout curto', () => {
    expect(args[args.indexOf('--retries') + 1]).toBe('1');
    expect(args).toContain('--socket-timeout');
  });
});

describe('AT-001 — video sai em MP4', () => {
  const args = montarArgsDownload({ ...BASE, formato: 'video' });

  it('filtra H.264 na origem', () => {
    const i = args.indexOf('-f');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toContain('vcodec');
  });

  it('mantem o fallback /b — sem ele, video so-progressivo falharia', () => {
    expect(args[args.indexOf('-f') + 1]).toMatch(/\/b$/);
  });

  it('pede merge em mp4 E remux — o merge sozinho e ignorado sem merge real', () => {
    expect(args[args.indexOf('--merge-output-format') + 1]).toBe('mp4');
    expect(args[args.indexOf('--remux-video') + 1]).toBe('mp4');
  });
});

describe('AT-004 — resolucao e preferencia, nao contrato', () => {
  it('usa -S res:N, que degrada sozinho', () => {
    const args = montarArgsDownload({ ...BASE, formato: 'video', alturaPreferida: 720 });
    expect(args[args.indexOf('-S') + 1]).toBe('res:720');
  });

  it('NUNCA usa -f [height<=N], que falharia se a altura nao existir', () => {
    const args = montarArgsDownload({ ...BASE, formato: 'video', alturaPreferida: 720 });
    expect(args.join(' ')).not.toContain('height<=');
  });

  it('sem altura escolhida, nao passa -S', () => {
    const args = montarArgsDownload({ ...BASE, formato: 'video' });
    expect(args).not.toContain('-S');
  });
});

describe('AT-002 — audio sai em MP3 de verdade', () => {
  const args = montarArgsDownload({ ...BASE, formato: 'audio' });

  it('extrai e converte explicitamente para mp3', () => {
    expect(args).toContain('-x');
    // `--audio-format best` (default) nao converte — nao entregaria .mp3.
    expect(args[args.indexOf('--audio-format') + 1]).toBe('mp3');
  });

  it('nao mistura flags de video', () => {
    expect(args).not.toContain('--remux-video');
    expect(args).not.toContain('--merge-output-format');
  });
});

describe('progresso e caminho final', () => {
  const args = montarArgsDownload({ ...BASE, formato: 'audio' });

  it('registra os DOIS canais de progresso', () => {
    const templates = args.filter((_, i) => args[i - 1] === '--progress-template');
    expect(templates).toHaveLength(2);
    expect(templates.some((t) => t.startsWith('download:'))).toBe(true);
    // Sem o canal postprocess a conversao MP3 fica muda e a barra congela.
    expect(templates.some((t) => t.startsWith('postprocess:'))).toBe(true);
  });

  it('todo campo opcional do template tem default |0 — senao o yt-dlp emite NA', () => {
    const templates = args.filter((_, i) => args[i - 1] === '--progress-template');
    for (const t of templates) {
      // Captura `%(progress.campo)j` SEM default — o bug que a medicao pegou.
      const semDefault = t.match(/%\(progress\.[a-z_]+\)j/g);
      expect(semDefault, `template sem default: ${t}`).toBeNull();
    }
  });

  it('pede o caminho final via after_move:filepath', () => {
    expect(args[args.indexOf('--print-to-file') + 1]).toBe('after_move:filepath');
  });

  it('passa --progress: sem ele o modo quiet implicito suprime tudo', () => {
    // Tanto `--print` quanto `--print-to-file` ligam `--quiet` implicitamente,
    // e quiet suprime o progresso: o template fica configurado mas nao emite
    // linha nenhuma e a barra fica parada o download inteiro. Medido em
    // runtime (yt-dlp 2026.07.04) — nao e teoria.
    expect(args).toContain('--progress');
  });

  it('usa --print-to-file, NUNCA --print', () => {
    // Com `--print`, o canal `postprocess` fica mudo mesmo com `--progress`,
    // e a barra congelaria em 100% durante a conversao MP3 — a falha exata
    // que o segundo canal existe para evitar. Medido em runtime.
    expect(args).toContain('--print-to-file');
    expect(args).not.toContain('--print');
  });

  it('grava o caminho no arquivo indicado', () => {
    expect(args[args.indexOf('--print-to-file') + 2]).toBe(BASE.arquivoDeCaminho);
  });
});

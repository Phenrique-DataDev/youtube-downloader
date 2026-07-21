/**
 * Onde o app guarda o que baixa. Separado do resto para que os testes possam
 * apontar o cache a um diretorio temporario (AT-003).
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

const NOME_APP = 'youtube-downloader';

export interface CaminhosApp {
  /** Raiz do cache de dependencias. */
  cache: string;
  /** yt-dlp.exe — o NOME ORIGINAL importa (ver bootstrap/deps.ts). */
  ytdlp: string;
  /** Diretorio que contem ffmpeg.exe e ffprobe.exe. */
  ffmpegDir: string;
  /** Log em arquivo. */
  log: string;
  /** Destino padrao dos downloads. */
  downloads: string;
}

export function resolverCaminhos(raizCache?: string): CaminhosApp {
  const base =
    raizCache ?? join(process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'), NOME_APP);

  return {
    cache: base,
    // NUNCA renomear: o checksum no SHA2-256SUMS e buscado por sufixo do nome,
    // e renomear faz a verificacao ser pulada em silencio (A-008).
    ytdlp: join(base, 'bin', 'yt-dlp.exe'),
    ffmpegDir: join(base, 'bin'),
    log: join(base, 'logs', 'app.log'),
    downloads: join(homedir(), 'Downloads'),
  };
}

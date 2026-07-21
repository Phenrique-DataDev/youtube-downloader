/**
 * Montagem dos argumentos do yt-dlp (DESIGN, secoes "Contrato de invocacao" e
 * "Seletores"). Funcao pura: devolve argv, nao executa nada — e o que permite
 * testar o contrato sem rede (AT-012).
 */

/**
 * Filtra H.264 na origem. Remuxar VP9/AV1 depois produziria arquivo que o
 * player nativo do Windows nao toca. O `/b` final impede falha em video
 * so-progressivo. Validado empiricamente em 2026-07-20: resolve para 299+258.
 */
const SELETOR_VIDEO_H264 = "bv*[vcodec~='^((he|a)vc|h26[45])']+ba/bv*+ba/b";

/**
 * Todo campo opcional precisa de default `|0`.
 *
 * Verificado empiricamente (yt-dlp 2026.07.04): `%(campo)j` emite `NA` literal
 * quando o campo falta, e `NA` quebra JSON.parse. A KB afirmava `null` — estava
 * errado. Sem os `|0` a barra de progresso morre no meio de downloads comuns.
 */
const TEMPLATE_DOWNLOAD =
  'download:{"tipo":"download","status":"%(progress.status)s",' +
  '"done":%(progress.downloaded_bytes|0)j,' +
  '"total":%(progress.total_bytes|0)j,' +
  '"est":%(progress.total_bytes_estimate|0)j,' +
  '"speed":%(progress.speed|0)j,' +
  '"eta":%(progress.eta|0)j,' +
  '"fragIdx":%(progress.fragment_index|0)j,' +
  '"fragTotal":%(progress.fragment_count|0)j}';

/**
 * Segundo canal, obrigatorio. Sem ele a conversao MP3 fica muda e a barra
 * congela em 100% enquanto o ffmpeg ainda trabalha.
 */
const TEMPLATE_POSTPROCESS =
  'postprocess:{"tipo":"postprocess","status":"%(progress.status)s",' +
  '"pp":"%(progress.postprocessor|)s"}';

export type Formato = 'video' | 'audio';

/**
 * O que sai quando o usuario pede audio.
 *
 * NAO e uma escala de qualidade. Medido em 2026-07-21 contra o catalogo real do
 * YouTube: a melhor trilha so-audio entrega ~130 kbps (itag 140, AAC) ou
 * ~129 kbps (itag 251, opus). Nao existe fidelidade acima disso para extrair,
 * entao oferecer "320 kbps" seria placebo — arquivo tres vezes maior, mesma
 * fonte, e ainda com perda de geracao. A escolha honesta e outra: transcodificar
 * para o formato que toca em qualquer lugar, ou preservar a trilha da origem.
 */
export type CodecAudio = 'mp3' | 'm4a';

export interface OpcoesDownload {
  urlCanonica: string;
  formato: Formato;
  /** Altura preferida (ex.: 720). Ausente = melhor disponivel. So vale para video. */
  alturaPreferida?: number;
  /** Codec de saida do audio. Ausente = mp3. Ignorado quando formato e video. */
  codecAudio?: CodecAudio;
  /** Diretorio de saida ja resolvido e confinado pelo chamador. */
  destino: string;
  /** Diretorio que contem ffmpeg.exe e ffprobe.exe. */
  ffmpegDir: string;
  /** Arquivo onde o yt-dlp grava o caminho final (ver `--print-to-file`). */
  arquivoDeCaminho: string;
}

/**
 * Flags presentes em TODA invocacao, com a razao registrada no DESIGN.
 * `-i`/`--ignore-errors` e proibido: faria o download ser considerado bem
 * sucedido mesmo com o pos-processamento falhando (quebraria o AT-002).
 */
function argsComuns(ffmpegDir: string): string[] {
  return ['--ignore-config', '--no-playlist', '--newline', '--ffmpeg-location', ffmpegDir];
}

/** Sonda barata: simula por default, nao baixa byte nenhum (AT-012). */
export function montarArgsProbe(urlCanonica: string, ffmpegDir: string): string[] {
  return [
    ...argsComuns(ffmpegDir),
    '-J',
    '--retries',
    '1',
    // A sonda deve falhar rapido; a persistencia fica para o download real.
    '--socket-timeout',
    '10',
    urlCanonica,
  ];
}

export function montarArgsDownload(opcoes: OpcoesDownload): string[] {
  const {
    urlCanonica,
    formato,
    alturaPreferida,
    codecAudio,
    destino,
    ffmpegDir,
    arquivoDeCaminho,
  } = opcoes;

  const args = [
    ...argsComuns(ffmpegDir),
    // `--progress` e OBRIGATORIO aqui. Medido em 2026-07-20 (yt-dlp
    // 2026.07.04): tanto `--print` quanto `--print-to-file` ligam `--quiet`
    // implicitamente, e o modo quiet suprime o progresso. Sem esta flag o
    // template fica configurado mas nao emite linha nenhuma.
    '--progress',
    '--progress-template',
    TEMPLATE_DOWNLOAD,
    '--progress-template',
    TEMPLATE_POSTPROCESS,
    // `--print-to-file`, NAO `--print`. Medido na mesma sessao: com `--print`
    // o canal `postprocess` fica mudo mesmo com `--progress` — a barra
    // congelaria em 100% durante a conversao MP3, que e exatamente a falha
    // que o segundo canal existe para evitar. Mandando o caminho a um arquivo,
    // os dois canais sobrevivem e o caminho nao precisa ser separado do ruido
    // do stdout.
    '--print-to-file',
    'after_move:filepath',
    arquivoDeCaminho,
    '--no-simulate',
    '-o',
    `${destino}/%(title).200B [%(id)s].%(ext)s`,
  ];

  if (formato === 'audio') {
    if (codecAudio === 'm4a') {
      // O `-f` aqui NAO e opcional, e a diferenca entre copiar e transcodificar.
      //
      // Medido em 2026-07-21 (yt-dlp 2026.07.04): com `-x --audio-format m4a`
      // sozinho, o `-x` puxa a melhor trilha — que no YouTube e opus — e o
      // ffmpeg recodifica opus->AAC. O resultado foi 8,7 MB a 338 kbps a partir
      // de uma origem de 3,3 MB: arquivo maior que o MP3, com perda de geracao,
      // exatamente o oposto do que esta opcao promete.
      //
      // Selecionando a trilha que JA e AAC, o yt-dlp reporta "Not converting
      // audio; file is already in target format" e so corrige o container:
      // 3,3 MB a 128 kbps, identico a origem. O `/ba` final cobre o video raro
      // que nao ofereca m4a — nesse caso ha conversao, e nao ha o que evitar.
      args.push('-f', 'ba[ext=m4a]/ba', '-x', '--audio-format', 'm4a');
    } else {
      // `--audio-format best` (default) NAO converte — nao entrega .mp3.
      // `--audio-quality 0` = melhor VBR do LAME; e teto de transcodificacao,
      // nao de fidelidade (a origem continua sendo ~130 kbps).
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    }
  } else {
    args.push('-f', SELETOR_VIDEO_H264, '--merge-output-format', 'mp4');
    // `--merge-output-format` e ignorado quando nao ha merge; o remux garante
    // o container MP4 que o AT-001 cobra.
    args.push('--remux-video', 'mp4');

    if (alturaPreferida !== undefined) {
      // `-S`, nao `-f`: preferencia, nao contrato. `-S` degrada sozinho para a
      // melhor disponivel; `-f [height<=N]` falharia se o video nao tiver.
      // `res:` em vez de `height:` porque ordena pela menor dimensao e trata
      // video vertical (Shorts) corretamente.
      args.push('-S', `res:${alturaPreferida}`);
    }
  }

  args.push(urlCanonica);
  return args;
}

export const _internos = { SELETOR_VIDEO_H264, TEMPLATE_DOWNLOAD, TEMPLATE_POSTPROCESS };

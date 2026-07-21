/**
 * Fixtures de stderr REAL, capturadas de execucoes verdadeiras do yt-dlp.
 *
 * Origem: yt-dlp 2026.07.04, Windows 11 pt-BR, 2026-07-20.
 *
 * O DESIGN exige fixture em vez de mock justamente aqui: as strings do extrator
 * nao sao contrato publico, entao a unica forma de detectar que o yt-dlp mudou a
 * mensagem e versionar a mensagem real e ver o teste quebrar.
 *
 * ATENCAO — trecho localizado: a fixture SEM_REDE contem texto em portugues
 * ("Nenhuma conexao pode ser feita...") porque vem do winsock do Windows, nao do
 * yt-dlp. Nenhum padrao do classificador pode depender dessa parte: numa maquina
 * em ingles ela viria diferente. Os padroes ancoram na parte que o yt-dlp
 * escreve, que e sempre em ingles.
 */

const AVISO_JS_RUNTIME =
  'WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is enabled ' +
  'by default; to use another runtime add  --js-runtimes RUNTIME[:PATH]  to your ' +
  'command/config. YouTube extraction without a JS runtime has been deprecated, and some ' +
  'formats may be missing. See  https://github.com/yt-dlp/yt-dlp/wiki/EJS  for details on ' +
  'installing one';

/** Video id inexistente (11 chars validos, video nao existe). */
export const VIDEO_INEXISTENTE = `${AVISO_JS_RUNTIME}
ERROR: [youtube] aaaaaaaaaaa: Video unavailable`;

/** Video removido/privado — o YouTube devolve o mesmo texto generico. */
export const VIDEO_INDISPONIVEL = `${AVISO_JS_RUNTIME}
ERROR: [youtube] ZoJ7iWEUSpI: Video unavailable`;

/**
 * Sem rede: capturado com proxy morto. A parte apos "[WinError 10061]" e
 * localizada pelo SO — o classificador NAO pode depender dela.
 */
export const SEM_REDE = `WARNING: [youtube] SocksHTTPSConnection(host='www.youtube.com', port=443): Failed to establish a new connection: [WinError 10061] Nenhuma conexao pode ser feita porque a maquina de destino as recusou ativamente. Retrying (1/3)...
WARNING: [youtube] SocksHTTPSConnection(host='www.youtube.com', port=443): Failed to establish a new connection: [WinError 10061] Nenhuma conexao pode ser feita porque a maquina de destino as recusou ativamente. Retrying (3/3)...
ERROR: [youtube] aBc123_-XyZ: Unable to download webpage: SocksHTTPSConnection(host='www.youtube.com', port=443): Failed to establish a new connection: [WinError 10061] Nenhuma conexao pode ser feita porque a maquina de destino as recusou ativamente (caused by TransportError("SocksHTTPSConnection(host='www.youtube.com', port=443): Failed to establish a new connection")). Giving up after 3 retries`;

/**
 * Rate limit / anti-bot. NAO capturada em execucao real — a validacao empirica
 * de A-005 nao conseguiu provocar bloqueio de um IP residencial, que e
 * exatamente o resultado desejado do produto.
 *
 * Texto vindo da documentacao/issues do yt-dlp. Marcada como NAO-VERIFICADA de
 * proposito: se um usuario reportar o bloqueio, a mensagem real substitui esta.
 */
export const RATE_LIMIT_NAO_VERIFICADA = `ERROR: [youtube] aBc123_-XyZ: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies for the authentication.`;

/** Idem — texto que engana: contem "isn't available" mas e rate limit. */
export const RATE_LIMIT_ENGANOSA_NAO_VERIFICADA = `ERROR: [youtube] aBc123_-XyZ: This content isn't available, try again later.`;

/** Falha que nao casa com padrao nenhum — alimenta o AT-013. */
export const DESCONHECIDA = `ERROR: [youtube] aBc123_-XyZ: Um erro completamente novo que ninguem previu (codigo 42)`;

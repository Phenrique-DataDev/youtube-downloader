/**
 * Camada 1 de defesa (DESIGN, Error Handling): validacao local da URL.
 *
 * Roda ANTES de qualquer spawn. O AT-005 exige que uma URL invalida nao dispare
 * nenhum subprocesso — validar aqui e o que torna isso verificavel.
 */

/** Hosts que o YouTube usa. `youtu.be` carrega o id no pathname, nao em `?v=`. */
const HOSTS_YOUTUBE = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const HOSTS_CURTOS = new Set(['youtu.be', 'www.youtu.be']);

/** Um id de video do YouTube tem exatamente 11 chars do alfabeto base64url. */
const RE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Prefixos de path que carregam o id fora do parametro `v`. */
const PREFIXOS_COM_ID_NO_PATH = ['/shorts/', '/embed/', '/live/', '/v/'];

export type ResultadoValidacao =
  | { ok: true; videoId: string; urlCanonica: string }
  | { ok: false; motivo: MotivoUrlInvalida; mensagem: string };

export type MotivoUrlInvalida = 'nao-e-url' | 'nao-e-youtube' | 'sem-video-id';

/**
 * Distingue "nao e URL" de "e URL, mas nao do YouTube" — o DESIGN pede essa
 * separacao porque as duas falhas pedem mensagens diferentes ao usuario.
 */
export function validarUrlYoutube(entrada: string): ResultadoValidacao {
  const bruta = entrada.trim();
  if (bruta.length === 0) {
    return { ok: false, motivo: 'nao-e-url', mensagem: 'Cole um link do YouTube.' };
  }

  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    return {
      ok: false,
      motivo: 'nao-e-url',
      mensagem: 'Isso nao parece um link. Cole o endereco completo do video.',
    };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      motivo: 'nao-e-url',
      mensagem: 'Isso nao parece um link. Cole o endereco completo do video.',
    };
  }

  const host = url.hostname.toLowerCase();
  const ehYoutube = HOSTS_YOUTUBE.has(host);
  const ehCurto = HOSTS_CURTOS.has(host);

  if (!ehYoutube && !ehCurto) {
    return {
      ok: false,
      motivo: 'nao-e-youtube',
      mensagem: 'Este link nao e do YouTube. Por enquanto so aceitamos videos do YouTube.',
    };
  }

  const videoId = extrairVideoId(url, ehCurto);
  if (videoId === null) {
    return {
      ok: false,
      motivo: 'sem-video-id',
      mensagem:
        'Nao encontrei um video neste link. Links de canal, playlist ou busca nao servem — ' +
        'abra o video e copie o endereco dele.',
    };
  }

  return {
    ok: true,
    videoId,
    // URL canonica: descarta `&list=`, `&t=` e afins. O `--no-playlist` do
    // contrato ja protege, mas nao ha razao de passar lixo ao subprocesso.
    urlCanonica: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function extrairVideoId(url: URL, ehCurto: boolean): string | null {
  if (ehCurto) {
    const candidato = url.pathname.slice(1).split('/')[0] ?? '';
    return RE_VIDEO_ID.test(candidato) ? candidato : null;
  }

  const doParametro = url.searchParams.get('v');
  if (doParametro !== null && RE_VIDEO_ID.test(doParametro)) {
    return doParametro;
  }

  const path = url.pathname;
  for (const prefixo of PREFIXOS_COM_ID_NO_PATH) {
    if (path.startsWith(prefixo)) {
      const candidato = path.slice(prefixo.length).split('/')[0] ?? '';
      return RE_VIDEO_ID.test(candidato) ? candidato : null;
    }
  }

  return null;
}

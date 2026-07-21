/**
 * Camada 3 (DESIGN, Error Handling): classificacao do erro real.
 *
 * Principio: o exit code decide SE falhou; o stderr TENTA dizer o que; o
 * fallback generico cobre o resto.
 *
 * As strings do extrator nao sao contrato publico — o yt-dlp pode muda-las em
 * qualquer release. Por isso o fallback e OBRIGATORIO (AT-013) e a classificacao
 * e best-effort. Os padroes abaixo vem de fixtures de stderr real, versionadas
 * em tests/fixtures/, para que a regressao seja detectavel quando mudarem.
 */

export type CategoriaErro =
  | 'indisponivel'
  | 'privado'
  | 'restrito-idade'
  | 'geobloqueado'
  | 'sem-rede'
  | 'rate-limit'
  | 'ao-vivo'
  | 'desconhecido';

export interface ErroClassificado {
  categoria: CategoriaErro;
  /** Mensagem para a UI: compreensivel, sem jargao, sem stderr cru. */
  mensagem: string;
  /** Detalhe tecnico, exibido so atras de "ver detalhes". */
  detalhe: string;
  /** Se vale a pena o usuario tentar de novo mais tarde. */
  temporario: boolean;
}

interface Padrao {
  categoria: CategoriaErro;
  testar: RegExp;
}

/**
 * ORDEM IMPORTA. O rate limit e testado ANTES de indisponivel porque a
 * mensagem "This content isn't available, try again later" contem "isn't
 * available" e seria capturada pelo padrao errado.
 *
 * Classificar isso como indisponivel faria o usuario concluir que o video
 * sumiu quando bastava esperar — o erro de diagnostico mais caro da lista.
 */
const PADROES: readonly Padrao[] = [
  {
    categoria: 'rate-limit',
    testar:
      /this content isn'?t available, try again later|sign in to confirm you'?re not a bot|too many requests|http error 429/i,
  },
  {
    categoria: 'sem-rede',
    testar:
      /unable to download (?:api page|webpage).*(?:getaddrinfo|timed out|connection|network is unreachable)|failed to resolve|name or service not known|\[errno -?\d+\]|urlopen error/i,
  },
  {
    categoria: 'privado',
    testar: /private video|this video is private|sign in if you'?ve been granted access/i,
  },
  {
    categoria: 'restrito-idade',
    testar: /age-?restricted|confirm your age|inappropriate for some users/i,
  },
  {
    categoria: 'geobloqueado',
    testar: /not available (?:in|from) your country|geo-?restricted|blocked it in your country/i,
  },
  {
    categoria: 'ao-vivo',
    testar:
      /is live|live event will begin|premieres in|this live stream recording is not available/i,
  },
  {
    categoria: 'indisponivel',
    testar:
      /video unavailable|has been removed|no longer available|does not exist|removed by the uploader|account associated with this video has been terminated/i,
  },
];

const MENSAGENS: Record<CategoriaErro, { mensagem: string; temporario: boolean }> = {
  'rate-limit': {
    mensagem:
      'O YouTube está limitando os pedidos deste computador no momento. ' +
      'Espere alguns minutos e tente de novo — o vídeo não sumiu.',
    temporario: true,
  },
  'sem-rede': {
    mensagem: 'Não consegui falar com o YouTube. Verifique sua conexão com a internet.',
    temporario: true,
  },
  privado: {
    mensagem: 'Este vídeo é privado. Só quem tem acesso concedido pelo dono consegue vê-lo.',
    temporario: false,
  },
  'restrito-idade': {
    mensagem:
      'Este vídeo tem restrição de idade e exige uma conta conectada, ' + 'o que este app não faz.',
    temporario: false,
  },
  geobloqueado: {
    mensagem: 'Este vídeo não está disponível na sua região.',
    temporario: false,
  },
  'ao-vivo': {
    mensagem:
      'Este vídeo é uma transmissão ao vivo ou ainda vai estrear. ' +
      'Tente novamente quando terminar.',
    temporario: true,
  },
  indisponivel: {
    mensagem: 'Este vídeo não está mais disponível — pode ter sido removido ou tornado privado.',
    temporario: false,
  },
  desconhecido: {
    // Fallback obrigatorio (SC-5/AT-013). Nunca joga stderr cru na UI.
    mensagem:
      'Não consegui baixar este vídeo. O motivo não foi identificado — ' +
      'veja os detalhes técnicos ou tente novamente.',
    temporario: true,
  },
};

/**
 * Preferir campo estruturado a grep de texto: quando o `-J` funcionou, os
 * campos `availability` e `live_status` classificam sem depender de string do
 * extrator. So caia no stderr quando o `-J` falhou inteiro.
 */
export function classificarPorMetadados(
  availability: string | null | undefined,
  liveStatus: string | null | undefined,
): ErroClassificado | null {
  if (liveStatus === 'is_live' || liveStatus === 'is_upcoming') {
    return montar('ao-vivo', `live_status=${liveStatus}`);
  }
  switch (availability) {
    case 'private':
      return montar('privado', 'availability=private');
    case 'subscriber_only':
      return montar('privado', 'availability=subscriber_only');
    case 'needs_auth':
      return montar('restrito-idade', 'availability=needs_auth');
    default:
      return null;
  }
}

export function classificarStderr(stderr: string, exitCode: number | null): ErroClassificado {
  const texto = stderr.trim();

  for (const padrao of PADROES) {
    if (padrao.testar.test(texto)) {
      return montar(padrao.categoria, detalheDe(texto, exitCode));
    }
  }

  return montar('desconhecido', detalheDe(texto, exitCode));
}

function montar(categoria: CategoriaErro, detalhe: string): ErroClassificado {
  const { mensagem, temporario } = MENSAGENS[categoria];
  return { categoria, mensagem, detalhe, temporario };
}

/**
 * Detalhe tecnico enxuto: as ultimas linhas nao-vazias do stderr mais o exit
 * code. O stderr COMPLETO vai para o log em arquivo, nunca para a UI.
 */
function detalheDe(stderr: string, exitCode: number | null): string {
  const linhas = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const relevantes = linhas.slice(-3).join('\n');
  const codigo = exitCode === null ? 'sem exit code' : `exit code ${exitCode}`;

  return relevantes.length > 0 ? `${relevantes}\n(${codigo})` : `(${codigo}, stderr vazio)`;
}

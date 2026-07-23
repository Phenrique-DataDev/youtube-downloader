/**
 * Defesas do servidor local (DESIGN, secao Security).
 *
 * Um servidor HTTP em localhost NAO e um endpoint inocente: qualquer pagina
 * que o usuario abrir no browser pode tentar falar com ele. Estas funcoes sao
 * puras de proposito — sao a parte que precisa ser testavel sem subir socket.
 */

import { timingSafeEqual } from 'node:crypto';

/**
 * DNS rebinding: um dominio hostil que resolve para 127.0.0.1 faria o browser
 * enviar requisicoes ao app com a origem do atacante, contornando a
 * same-origin policy. O header `Host` denuncia isso — so aceitamos loopback
 * literal na porta que subimos.
 */
export function hostEhPermitido(host: string | undefined, porta: number): boolean {
  if (host === undefined) return false;

  const permitidos = new Set([`127.0.0.1:${porta}`, `localhost:${porta}`, `[::1]:${porta}`]);

  return permitidos.has(host.toLowerCase().trim());
}

/**
 * Procedencia do pedido, pelo header `Sec-Fetch-Site`.
 *
 * O browser preenche este header sozinho e JS de pagina NAO consegue forja-lo
 * (e forbidden header name). Ele existe aqui como camada independente: se um
 * dia a ausencia de CORS deixar de bastar para esconder o token de
 * `/api/sessao`, esta checagem ainda barra o pedido de terceiro.
 *
 * Ausente => permitido. Quem nao e browser (a sonda de instancia, um curl)
 * simplesmente nao manda o header, e nenhum deles e o vetor de CSRF que isto
 * barra — o vetor e uma PAGINA aberta no browser da propria pessoa.
 */
export function procedenciaEhPermitida(secFetchSite: string | undefined): boolean {
  if (secFetchSite === undefined) return true;

  return secFetchSite.toLowerCase().trim() !== 'cross-site';
}

/**
 * Comparacao de token em tempo constante. Comparar com `===` vazaria o token
 * por timing — a diferenca e pequena, mas o custo de fazer certo e zero.
 */
export function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  if (recebido === undefined) return false;

  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  // timingSafeEqual exige tamanhos iguais; comprimento diferente ja e falha.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * Confina o destino dentro do diretorio permitido. Protege contra
 * `../../Windows/System32` vindo de qualquer campo controlavel pelo usuario.
 */
export function caminhoEstaConfinado(caminhoResolvido: string, raizPermitida: string): boolean {
  const normalizar = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

  const alvo = normalizar(caminhoResolvido);
  const raiz = normalizar(raizPermitida);

  return alvo === raiz || alvo.startsWith(`${raiz}/`);
}

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * A UI e servida como esta — sem build e sem framework — entao o unico jeito
 * honesto de testa-la e carregar o `index.html` REAL e rodar o `app.js` REAL
 * contra ele. Um teste que montasse um DOM proprio nao teria pego o bug que
 * originou este arquivo: o `<button>` nascia habilitado no HTML enquanto o JS
 * assumia `prontoParaBaixar = false`. HTML e JS discordavam, e nenhum dos dois
 * estava "errado" sozinho.
 *
 * `app.js` nao tem import/export (e carregado com `type=module` so por
 * conveniencia), entao roda como script classico dentro do jsdom.
 */

const raizUi = join(import.meta.dirname, '..', '..', 'src', 'ui');

type Resposta = { ok: boolean; status: number; corpo?: unknown };

/**
 * Monta a pagina com um `fetch` falso. `respostas` e consultado por rota; o
 * `t=` da URL existe so para o `app.js` achar um token — quem decide se ele
 * vale e a resposta simulada, nao o valor.
 */
async function montarPagina(respostas: Record<string, Resposta>) {
  const [html, js] = await Promise.all([
    readFile(join(raizUi, 'index.html'), 'utf8'),
    readFile(join(raizUi, 'app.js'), 'utf8'),
  ]);

  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:47821/?t=token-desta-aba',
    runScripts: 'dangerously',
  });

  const chamadas: string[] = [];

  Object.defineProperty(dom.window, 'fetch', {
    writable: true,
    value: (rota: string) => {
      chamadas.push(rota);
      const r = respostas[rota] ?? { ok: false, status: 500 };
      return Promise.resolve({
        ok: r.ok,
        status: r.status,
        json: () => Promise.resolve(r.corpo ?? {}),
      });
    },
  });

  // O `<script src>` do HTML nao carrega no jsdom (nao ha servidor). Injetar o
  // conteudo depois do fetch falso garante que o app.js ja o encontre pronto.
  const tag = dom.window.document.createElement('script');
  tag.textContent = js;
  dom.window.document.body.appendChild(tag);

  return { dom, doc: dom.window.document, chamadas };
}

/** O bootstrap e assincrono; espera a condicao em vez de cravar um sleep. */
async function ate(condicao: () => boolean, limiteMs = 2000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (condicao()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('condicao nao ocorreu dentro do limite');
}

describe('UI — bootstrap e sessao', () => {
  it('o botao nasce desabilitado, antes de qualquer resposta', async () => {
    // Sem estado resolvido: o servidor "existe" mas ainda nao respondeu nada.
    const { doc } = await montarPagina({});
    const botao = doc.getElementById('botao') as HTMLButtonElement;

    // Direto do HTML, sem esperar o JS: o atributo tem que vir marcado.
    expect(botao.disabled).toBe(true);
  });

  it('habilita o botao quando o app responde que esta pronto', async () => {
    const { doc } = await montarPagina({
      '/api/estado': { ok: true, status: 200, corpo: { fase: 'pronto' } },
    });
    const botao = doc.getElementById('botao') as HTMLButtonElement;
    const aviso = doc.getElementById('aviso-preparo') as HTMLElement;

    await ate(() => !botao.disabled);

    expect(botao.disabled).toBe(false);
    expect(aviso.hidden).toBe(true);
  });

  /**
   * O bug. Antes, o 401 caia num `catch {}` vazio: a UI repetia a chamada para
   * sempre, o aviso ficava escondido e o botao — habilitado pelo HTML —
   * parecia utilizavel. Clicar nele nao fazia absolutamente nada, sem nenhuma
   * mensagem.
   */
  it('token expirado vira mensagem explicita, nao silencio', async () => {
    const { doc } = await montarPagina({
      '/api/estado': { ok: false, status: 401 },
    });
    const botao = doc.getElementById('botao') as HTMLButtonElement;
    const aviso = doc.getElementById('aviso-preparo') as HTMLElement;
    const texto = doc.getElementById('aviso-preparo-texto') as HTMLElement;

    await ate(() => !aviso.hidden);

    expect(botao.disabled).toBe(true);
    expect(texto.textContent).toContain('execução anterior');
    // Sem spinner: nao ha trabalho em curso que justifique prometer espera.
    expect(aviso.classList.contains('aviso-parado')).toBe(true);
  });

  it('para de repetir depois do 401 — o token nao volta a valer', async () => {
    const { chamadas } = await montarPagina({
      '/api/estado': { ok: false, status: 401 },
    });

    await ate(() => chamadas.length > 0);
    const apos401 = chamadas.length;

    // Uma tentativa levaria 500 ms; esperar o dobro sem nova chamada mostra
    // que o laco parou de verdade.
    await new Promise((r) => setTimeout(r, 1100));

    expect(chamadas.length).toBe(apos401);
    expect(apos401).toBe(1);
  });
});

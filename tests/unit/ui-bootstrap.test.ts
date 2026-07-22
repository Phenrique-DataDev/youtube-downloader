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
 * Monta a pagina com um `fetch` falso, consultado por rota.
 *
 * `/api/sessao` ganha um default valido porque agora ela e a PRIMEIRA chamada
 * de toda carga — sem ela nao ha token e nada mais acontece. Um teste que
 * queira exercitar a falha de sessao sobrescreve a rota explicitamente.
 */
async function montarPagina(respostas: Record<string, Resposta>) {
  const comSessao: Record<string, Resposta> = {
    '/api/sessao': { ok: true, status: 200, corpo: { token: 'token-da-execucao-atual' } },
    ...respostas,
  };

  const [html, js] = await Promise.all([
    readFile(join(raizUi, 'index.html'), 'utf8'),
    readFile(join(raizUi, 'app.js'), 'utf8'),
  ]);

  // URL LIMPA, como o favorito da pessoa. O token nao vem mais daqui — a
  // pagina o busca em /api/sessao depois de carregar.
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:47821/',
    runScripts: 'dangerously',
  });

  const chamadas: string[] = [];

  Object.defineProperty(dom.window, 'fetch', {
    writable: true,
    value: (rota: string) => {
      chamadas.push(rota);
      const r = comSessao[rota] ?? { ok: false, status: 500 };
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

    // Conta so /api/estado: /api/sessao tambem aparece em `chamadas`, e
    // esperar por "qualquer chamada" resolveria antes de o laco sequer comecar.
    const tentativas = () => chamadas.filter((r) => r === '/api/estado').length;

    await ate(() => tentativas() > 0);
    const apos401 = tentativas();

    // Uma tentativa levaria 500 ms; esperar o dobro sem nova chamada mostra
    // que o laco parou de verdade.
    await new Promise((r) => setTimeout(r, 1100));

    expect(tentativas()).toBe(apos401);
    expect(apos401).toBe(1);
  });

  /**
   * Se `/api/sessao` falha, nao ha token e nenhuma chamada seguinte passaria do
   * 401. Falhar em silencio aqui devolveria exatamente a tela morta que o ciclo
   * anterior veio eliminar — so que numa etapa mais cedo.
   */
  it('falha ao abrir sessao tambem vira mensagem', async () => {
    const { doc } = await montarPagina({
      '/api/sessao': { ok: false, status: 500 },
    });
    const botao = doc.getElementById('botao') as HTMLButtonElement;
    const aviso = doc.getElementById('aviso-preparo') as HTMLElement;

    await ate(() => !aviso.hidden);

    expect(botao.disabled).toBe(true);
    expect(aviso.classList.contains('aviso-parado')).toBe(true);
  });

  /**
   * Cenario 4 do DESIGN: o app teve de subir noutra porta, entao o favorito da
   * pessoa nao aponta para ca. Sem este aviso o link salvo apenas "para de
   * funcionar", sem explicacao.
   */
  it('avisa quando o endereco nao e o de sempre', async () => {
    const { doc } = await montarPagina({
      '/api/sessao': {
        ok: true,
        status: 200,
        corpo: { token: 'tok', enderecoEstavel: false },
      },
      '/api/estado': { ok: true, status: 200, corpo: { fase: 'pronto' } },
    });
    const avisoEndereco = doc.getElementById('aviso-endereco') as HTMLElement;

    await ate(() => !avisoEndereco.hidden);

    expect(avisoEndereco.hidden).toBe(false);
  });

  it('nao avisa quando o endereco e o de sempre', async () => {
    const { doc } = await montarPagina({
      '/api/sessao': { ok: true, status: 200, corpo: { token: 'tok', enderecoEstavel: true } },
      '/api/estado': { ok: true, status: 200, corpo: { fase: 'pronto' } },
    });
    const botao = doc.getElementById('botao') as HTMLButtonElement;
    const avisoEndereco = doc.getElementById('aviso-endereco') as HTMLElement;

    await ate(() => !botao.disabled);

    expect(avisoEndereco.hidden).toBe(true);
  });
});

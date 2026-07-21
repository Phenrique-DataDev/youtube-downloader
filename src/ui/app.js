/**
 * UI local. Sem framework e sem build: e servido como esta.
 *
 * O token de sessao chega na querystring da URL que o app abriu e vai em todas
 * as chamadas de API. Sem ele o servidor responde 401 — e o que impede uma
 * pagina qualquer aberta no browser de disparar downloads (CSRF local).
 */

const TOKEN = new URLSearchParams(location.search).get('t') ?? '';

const el = (id) => document.getElementById(id);

const formulario = el('formulario');
const campoUrl = el('url');
const seletorResolucao = el('resolucao');
const dicaResolucao = el('dica-resolucao');
const campoResolucao = el('campo-resolucao');
const campoCodecAudio = el('campo-codec-audio');
const seletorCodecAudio = el('codec-audio');
const rotuloCodecAudio = el('rotulo-codec-audio');
const botao = el('botao');
const painel = el('painel');
const info = el('info');
const thumbSlot = el('thumb-slot');
const titulo = el('titulo');
const canal = el('canal');
const caixaProgresso = el('progresso-caixa');
const barra = el('barra-preenchida');
const rotuloProgresso = el('progresso-rotulo');
const numerosProgresso = el('progresso-numeros');
const caixaSucesso = el('sucesso');
const caminhoArquivo = el('caminho-arquivo');
const caixaErro = el('erro');
const mensagemErro = el('erro-mensagem');
const detalhesErro = el('erro-detalhes');
const caixaDetalhesErro = el('erro-detalhes-caixa');
const avisoPreparo = el('aviso-preparo');
const avisoPreparoTexto = el('aviso-preparo-texto');

let sondando = false;
let baixando = false;
let prontoParaBaixar = false;

/* ---------------------------------------------------------------- bootstrap */

/**
 * AT-003: enquanto o cache nao esta pronto, o botao fica desabilitado com
 * aviso de preparo. A UI aparece antes do bootstrap terminar (SC-1), entao
 * este estado e normal na primeira execucao, nao um erro.
 */
async function acompanharBootstrap() {
  for (;;) {
    try {
      const estado = await chamar('/api/estado');
      aplicarEstadoBootstrap(estado);
      if (estado.fase === 'pronto' || estado.fase === 'falhou') return;
    } catch {
      // Servidor ainda subindo ou indisponivel por um instante: tenta de novo.
    }
    await esperar(500);
  }
}

function aplicarEstadoBootstrap(estado) {
  if (estado.fase === 'pronto') {
    prontoParaBaixar = true;
    avisoPreparo.hidden = true;
    atualizarBotao();
    return;
  }

  if (estado.fase === 'falhou') {
    prontoParaBaixar = false;
    avisoPreparo.hidden = false;
    avisoPreparoTexto.textContent = estado.mensagem ?? 'Não consegui preparar as dependências.';
    atualizarBotao();
    return;
  }

  prontoParaBaixar = false;
  avisoPreparo.hidden = false;
  avisoPreparoTexto.textContent =
    estado.fase === 'baixando'
      ? `Baixando ${estado.oQue}… (só na primeira execução)`
      : 'Preparando…';
  atualizarBotao();
}

/* ----------------------------------------------------------------- formato */

const radiosFormato = formulario.querySelectorAll('input[name="formato"]');

function formatoEscolhido() {
  return formulario.querySelector('input[name="formato"]:checked').value;
}

/**
 * O painel avancado mostra so o que vale para o formato escolhido. Resolucao
 * nao existe em audio — o `montarArgsDownload` sequer le a altura nesse ramo —
 * e formato de audio nao existe em video.
 */
function ajustarAvancado() {
  const audio = formatoEscolhido() === 'audio';
  campoResolucao.hidden = audio;
  campoCodecAudio.hidden = !audio;
}

/**
 * A pilula anuncia a extensao que vai sair. Deixa-la fixa em "MP3" faria a
 * escolha de M4A ficar invisivel fora do painel recolhido — o mesmo tipo de
 * promessa desalinhada que a resolucao fazia em audio.
 */
function ajustarRotuloCodec() {
  rotuloCodecAudio.textContent = seletorCodecAudio.value.toUpperCase();
}

for (const radio of radiosFormato) {
  radio.addEventListener('change', ajustarAvancado);
}

seletorCodecAudio.addEventListener('change', ajustarRotuloCodec);

ajustarAvancado();
ajustarRotuloCodec();

/* -------------------------------------------------------------------- sonda */

let temporizadorSonda = null;

campoUrl.addEventListener('input', () => {
  clearTimeout(temporizadorSonda);
  limparResultado();
  const valor = campoUrl.value.trim();
  if (valor.length === 0) {
    resetarResolucoes('Cole um link primeiro — as opções vêm do vídeo.');
    return;
  }
  // Espera o usuario parar de digitar: sondar a cada tecla desperdicaria
  // requisicao ao YouTube e conta contra o limite de taxa.
  temporizadorSonda = setTimeout(sondar, 600);
});

async function sondar() {
  const url = campoUrl.value.trim();
  if (url.length === 0 || sondando) return;

  sondando = true;
  atualizarBotao();
  resetarResolucoes('Consultando o vídeo…');

  try {
    const resposta = await chamar('/api/sondar', { url });

    if (!resposta.ok) {
      mostrarErro(resposta.erro);
      resetarResolucoes('Não consegui ler este vídeo.');
      return;
    }

    mostrarInfo(resposta.metadados);
    preencherResolucoes(resposta.metadados.resolucoes);
  } catch (erro) {
    mostrarErro({ mensagem: 'Não consegui consultar o vídeo.', detalhe: String(erro) });
  } finally {
    sondando = false;
    atualizarBotao();
  }
}

function mostrarInfo(metadados) {
  painel.hidden = false;
  info.hidden = false;
  titulo.textContent = metadados.titulo;
  canal.textContent = metadados.canal ?? '';

  // A miniatura so e criada quando existe URL de verdade — `thumbnail` pode
  // vir null, e uma imagem sem endereco renderiza como caixa quebrada.
  thumbSlot.replaceChildren();
  if (metadados.thumbnail) {
    const imagem = document.createElement('img');
    imagem.className = 'thumb';
    imagem.alt = '';
    imagem.src = metadados.thumbnail;
    // Se a miniatura falhar em carregar, some com ela em vez de deixar a
    // caixa quebrada na tela.
    imagem.addEventListener('error', () => thumbSlot.replaceChildren());
    thumbSlot.append(imagem);
  }
}

/**
 * O menu e preenchido com as resolucoes que ESTE video tem, vindas do catalogo
 * do -J. Um menu fixo 1080/720/480 mentiria para quem cola um video que so
 * existe em 360p.
 */
function preencherResolucoes(resolucoes) {
  seletorResolucao.replaceChildren();

  const melhor = document.createElement('option');
  melhor.value = '';
  melhor.textContent = 'Melhor disponível';
  seletorResolucao.append(melhor);

  for (const r of resolucoes) {
    const opcao = document.createElement('option');
    opcao.value = String(r.altura);
    opcao.textContent = r.rotulo;
    seletorResolucao.append(opcao);
  }

  seletorResolucao.disabled = resolucoes.length === 0;
  dicaResolucao.textContent =
    resolucoes.length === 0
      ? 'Este vídeo não oferece escolha de resolução.'
      : 'Se a resolução escolhida não existir, uso a mais próxima.';
}

function resetarResolucoes(dica) {
  seletorResolucao.replaceChildren(novaOpcao('', 'Melhor disponível'));
  seletorResolucao.disabled = true;
  dicaResolucao.textContent = dica;
}

function novaOpcao(valor, texto) {
  const opcao = document.createElement('option');
  opcao.value = valor;
  opcao.textContent = texto;
  return opcao;
}

/* ----------------------------------------------------------------- download */

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (baixando || !prontoParaBaixar) return;

  const url = campoUrl.value.trim();
  const formato = formatoEscolhido();
  const altura = seletorResolucao.value;

  baixando = true;
  atualizarBotao();
  limparResultado({ manterInfo: true });
  painel.hidden = false;
  caixaProgresso.hidden = false;
  definirProgresso(null, 'Iniciando…', '');

  try {
    // Cada opcao so viaja no formato a que pertence: mandar altura num pedido
    // de audio faria o corpo prometer algo que o servidor ignora.
    await baixarComSse({
      url,
      formato,
      ...(formato === 'video' && altura ? { alturaPreferida: Number(altura) } : {}),
      ...(formato === 'audio' ? { codecAudio: seletorCodecAudio.value } : {}),
    });
  } catch (erro) {
    mostrarErro({ mensagem: 'O download foi interrompido.', detalhe: String(erro) });
  } finally {
    baixando = false;
    atualizarBotao();
  }
});

/**
 * SSE por POST: o EventSource nativo so faz GET, e o corpo do pedido tem
 * varios campos. Lemos o stream manualmente — o formato do SSE e simples o
 * bastante para nao justificar biblioteca.
 */
async function baixarComSse(corpo) {
  const resposta = await fetch('/api/baixar', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-token': TOKEN },
    body: JSON.stringify(corpo),
  });

  if (!resposta.ok || resposta.body === null) {
    throw new Error(`Servidor respondeu ${resposta.status}`);
  }

  const leitor = resposta.body.pipeThrough(new TextDecoderStream()).getReader();
  let acumulado = '';

  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;

    acumulado += value;
    // Eventos SSE sao separados por linha em branco.
    const blocos = acumulado.split('\n\n');
    acumulado = blocos.pop() ?? '';

    for (const bloco of blocos) {
      const evento = interpretarBlocoSse(bloco);
      if (evento !== null) tratarEvento(evento.nome, evento.dado);
    }
  }
}

function interpretarBlocoSse(bloco) {
  let nome = 'message';
  const dados = [];

  for (const linha of bloco.split('\n')) {
    if (linha.startsWith('event: ')) nome = linha.slice(7).trim();
    else if (linha.startsWith('data: ')) dados.push(linha.slice(6));
  }

  if (dados.length === 0) return null;
  try {
    return { nome, dado: JSON.parse(dados.join('\n')) };
  } catch {
    return null;
  }
}

function tratarEvento(nome, dado) {
  if (nome === 'progresso') {
    aplicarProgresso(dado);
    return;
  }
  if (nome === 'fim') {
    caixaProgresso.hidden = true;
    if (dado.ok) mostrarSucesso(dado.caminhoArquivo);
    else mostrarErro(dado.erro);
    return;
  }
  if (nome === 'erro') {
    caixaProgresso.hidden = true;
    mostrarErro({ mensagem: dado.mensagem, detalhe: '' });
  }
}

function aplicarProgresso(evento) {
  if (evento.fase === 'postprocess') {
    // Segundo canal: sem ele a barra congelaria em 100% durante a conversao.
    definirProgresso(null, 'Convertendo…', '');
    return;
  }

  const numeros = [
    evento.bytesTotais
      ? `${formatarBytes(evento.bytesFeitos)} / ${formatarBytes(evento.bytesTotais)}`
      : formatarBytes(evento.bytesFeitos),
    evento.velocidade ? `${formatarBytes(evento.velocidade)}/s` : '',
    evento.etaSegundos ? `${formatarTempo(evento.etaSegundos)} restantes` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  definirProgresso(evento.fracao, 'Baixando…', numeros);
}

/** `fracao === null` => barra indeterminada, em vez de inventar porcentagem. */
function definirProgresso(fracao, rotulo, numeros) {
  rotuloProgresso.textContent = rotulo;
  numerosProgresso.textContent = numeros;

  if (fracao === null || fracao === undefined) {
    barra.classList.add('indeterminada');
    barra.style.transform = '';
    return;
  }

  barra.classList.remove('indeterminada');
  // scaleX em vez de width: a barra atualiza dezenas de vezes por segundo e
  // animar largura forcaria relayout a cada quadro.
  barra.style.transform = `scaleX(${Math.max(0, Math.min(1, fracao))})`;
}

/* ------------------------------------------------------------------ estados */

function mostrarSucesso(caminho) {
  painel.hidden = false;
  caixaSucesso.hidden = false;
  caminhoArquivo.textContent = caminho;
}

function mostrarErro(erro) {
  painel.hidden = false;
  caixaErro.hidden = false;
  mensagemErro.textContent = erro?.mensagem ?? 'Algo deu errado.';

  const detalhe = erro?.detalhe ?? '';
  detalhesErro.textContent = detalhe;
  // Sem detalhe tecnico nao ha o que revelar — nao mostre um "ver detalhes"
  // que abre vazio.
  caixaDetalhesErro.hidden = detalhe.length === 0;
}

function limparResultado({ manterInfo = false } = {}) {
  caixaSucesso.hidden = true;
  caixaErro.hidden = true;
  caixaProgresso.hidden = true;
  if (!manterInfo) {
    info.hidden = true;
    thumbSlot.replaceChildren();
  }
  if (!manterInfo && caixaSucesso.hidden && caixaErro.hidden) painel.hidden = true;
}

function atualizarBotao() {
  botao.disabled = baixando || !prontoParaBaixar;
  botao.textContent = baixando ? 'Baixando…' : 'Baixar';
}

/* ---------------------------------------------------------------- utilitarios */

async function chamar(rota, corpo) {
  const resposta = await fetch(rota, {
    method: corpo ? 'POST' : 'GET',
    headers: corpo
      ? { 'content-type': 'application/json', 'x-token': TOKEN }
      : { 'x-token': TOKEN },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.json();
}

function formatarBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${unidades[i]}`;
}

function formatarTempo(segundos) {
  const s = Math.round(segundos);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

acompanharBootstrap();

# BRAINSTORM: Arquitetura e forma de entrega

> Sessão exploratória para clarear intenção e abordagem antes de capturar requisitos.

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | ARQUITETURA_ENTREGA |
| **Data** | 2026-07-20 |
| **Status** | Pronto para Define |

---

## Ideia inicial

**Input bruto:** *"app/site com interface para baixar vídeos e áudios do youtube (opção
selecionável) de maneira gratuita através do gitworkflow / github pages"* — depois refinado para
*"quero publicar para a pessoa entrar e usar sem instalar nada; custo precisa ser 0; a arquitetura
pode ser estudada ainda"*.

**Contexto observado:**
- Repositório **greenfield**: só o scaffold SDD (`.claude/`, `AGENTS.md`, `CLAUDE.md`, `docs/`,
  `inbox/`). Sem código, sem commits, sem remoto.
- `project-context.md` preenchido no mesmo dia pelo `/setup`, já registrando esta decisão como
  **em aberto** — este brainstorm é quem a fecha.
- Stack escolhida no `/setup`: TypeScript/Node, ESLint+Prettier, Conventional Commits, CI no
  GitHub Actions.

---

## Perguntas e respostas (descoberta)

| # | Pergunta | Resposta | Impacto na solução |
|---|----------|----------|--------------------|
| 1 | O que o projeto é, concretamente? | App/site com interface, vídeo **ou** áudio selecionável | Exige transcodificação/extração (ffmpeg), não só download bruto |
| 2 | Qual stack? | TypeScript/Node | Descarta Python/PowerShell; o binário de mídia entra como dependência externa |
| 3 | Quem usa? | Qualquer pessoa, via link público, sem instalar nada | Restrição depois **relaxada** — ver "Premissa derrubada" |
| 4 | Qual o teto de custo? | Zero, rígido | Elimina proxy residencial e backend pago |
| 5 | Qual restrição cede, dado que as três são incompatíveis? | **"Sem instalação"** | Vira app local; o Pages hospeda landing/docs |
| 6 | Como o usuário roda? | **Executável único** (GitHub Releases) | Zero pré-requisito; cria o problema de binário defasado |
| 7 | Qual a interface? | **Web UI local** (localhost, abre no browser) | Preserva a experiência visual pretendida no pedido original |

---

## Premissa derrubada (achado central)

O pedido original — **público + sem instalação + custo zero** — **não é satisfazível**. O gargalo
não é custo: é o **IP de origem do download**. Verificado por pesquisa em 2026-07-20:

| Caminho considerado | Por que não funciona |
|---------------------|----------------------|
| **Só browser** (Pages puro, WASM) | `*.googlevideo.com` não envia `Access-Control-Allow-Origin` e libera apenas a origem `youtube.com`. O browser bloqueia; exige intermediário no servidor. Não contornável no cliente. |
| **GitHub Actions como worker** | Runners usam **IPs de datacenter da Azure**, sinalizados pela detecção de bot do YouTube (relatos de bloqueio após ~5–10 downloads, limiar caindo em 2025-26). Ainda: `workflow_dispatch` exige token com escrita — usuário anônimo não dispara sem expor um segredo. |
| **Backend em free tier** | Mesmo problema de IP de datacenter; free tiers encolheram (Fly/Railway sem grátis real, Render hiberna). A mitigação conhecida é **proxy residencial**, que é pago por GB. |
| **Extensão de browser** | Tecnicamente elegante (origem `youtube.com`, IP residencial, zero servidor), mas a **política da Chrome Web Store proíbe** baixar do YouTube e houve expurgo dessas extensões em 2025. Publicar é apostar em remoção. |

**Conclusão:** o download precisa sair de um **IP residencial** — na prática, a máquina de quem
usa. Foi por isso que "sem instalação" foi a restrição escolhida para ceder.

### Fatores de contexto registrados

- **Fragilidade do `yt-dlp`**: quebra com frequência quando o YouTube muda — molda diretamente a
  estratégia de atualização (ver Decisões).
- **Termos de Serviço**: baixar do YouTube conflita com os ToS da plataforma. A superfície é menor
  numa ferramenta que o usuário roda localmente do que num serviço público hospedado em seu nome,
  mas o ponto fica registrado, não resolvido.

---

## Amostras / grounding

| Tipo | Local | Qtd | Notas |
|------|-------|-----|-------|
| Entradas | N/A | 0 | Projeto greenfield; entrada é uma URL do YouTube |
| Saídas-exemplo | N/A | 0 | Saída é arquivo de mídia (formato a definir no DEFINE) |
| Ground truth | N/A | 0 | Nenhum ainda — os fatos de viabilidade vieram de pesquisa web (ver Fontes) |

---

## Abordagens exploradas

### Abordagem A: Executável único + Web UI local ⭐ Recomendada
**Descrição:** binário por SO publicado em GitHub Releases (build no Actions). Ao rodar, sobe um
servidor em `localhost`, abre o browser e serve a UI. O download usa o IP residencial do usuário.
GitHub Pages hospeda landing, instruções e link para o Release.

**Prós:** custo zero real e permanente; IP residencial (o único que funciona); zero pré-requisito
para quem usa; preserva a experiência visual do pedido original; não depende de burlar política de
loja nem de proxy pago.
**Contras:** exige download+execução (fricção e alerta de SmartScreen/Gatekeeper em binário não
assinado); binário embutido envelhece junto com o `yt-dlp`; build multiplataforma a manter.
**Por que recomendada:** é a única que satisfaz custo zero **e** funciona de forma robusta, porque
resolve o problema de IP em vez de tentar contorná-lo.

### Abordagem B: Backend próprio + proxy residencial
**Descrição:** frontend no Pages, API em servidor real, tráfego do YouTube saindo por proxy
residencial pago.
**Prós:** UX de site puro — cola URL e baixa, sem instalar nada; atende o pedido original ao pé
da letra.
**Contras:** viola a restrição de custo zero (proxy ~US$1–5/GB, escala com uso); serviço público e
anônimo é alvo de abuso automatizado, exigindo rate limit/autenticação; exposição pública em nome
do usuário.

### Abordagem C: Extensão de browser
**Descrição:** extensão que roda na origem `youtube.com`, sem servidor.
**Prós:** resolve CORS e IP de uma vez; custo zero; sem servidor.
**Contras:** proibida pela política da Chrome Web Store; expurgo documentado em 2025; a
distribuição pública — que é o objetivo — é justamente o que não se sustenta.

---

## Abordagem escolhida

| Atributo | Valor |
|----------|-------|
| **Escolhida** | Abordagem A — executável único + Web UI local |
| **Confirmada por** | usuário, 2026-07-20 |
| **Razão** | Única que preserva custo zero sem depender de IP de datacenter, proxy pago ou política de loja hostil |

---

## Decisões e cortes (YAGNI)

| Decisão | Razão | Alternativa rejeitada |
|---------|-------|-----------------------|
| Ceder "sem instalação" em vez de "custo zero" | O IP residencial é requisito técnico, não preferência | Ceder custo zero (Abordagem B) |
| Web UI local em vez de CLI | Preserva a interface pretendida no pedido original | CLI interativa |
| Executável único em vez de `npx` | Zero pré-requisito para leigos | `npx` (exigiria Node instalado) |
| **`yt-dlp` atualizado em runtime, não embutido congelado** | O `yt-dlp` quebra com frequência; binário congelado apodrece entre releases | Embutir versão fixa no executável |
| GitHub Pages vira landing/docs, não o app | Pages não executa código de servidor | Pages como host do app |

| Feature cortada | Razão (YAGNI) | Dá pra adicionar depois? |
|-----------------|---------------|--------------------------|
| Playlists / downloads em lote | Fluxo de uma URL primeiro; lote multiplica estados de erro | Sim |
| Legendas e capítulos | Não pedido; ortogonal ao núcleo | Sim |
| Histórico / fila persistente | Sessão única basta para validar o produto | Sim |
| Contas, autenticação, quotas | Sem servidor, não há o que proteger | Não se aplica |
| Assinatura de código do binário | Custa dinheiro (certificado); alerta do SO é aceitável no v1 | Sim |
| Auto-update do próprio executável | O que precisa de frescor é o `yt-dlp`, já resolvido acima | Sim |

---

## Rascunho de requisitos para o /define

- **Problema (rascunho):** não existe forma gratuita e confiável de baixar vídeo ou áudio do
  YouTube sem depender de sites intermediários cheios de anúncio ou de ferramentas de linha de
  comando inacessíveis a leigos.
- **Usuários-alvo:** pessoa não-técnica no próprio computador (Windows como alvo primário, dado o
  ambiente do autor); secundariamente o próprio autor.
- **Success criteria (rascunho):**
  - Usuário baixa o executável de um GitHub Release e roda sem instalar dependência nenhuma.
  - Ao executar, a UI abre sozinha no browser.
  - Cola uma URL do YouTube, escolhe **vídeo** ou **áudio**, e recebe o arquivo em disco.
  - O `yt-dlp` se mantém atualizado sem exigir novo download do executável.
  - Erro de rede/URL inválida/vídeo indisponível vira mensagem compreensível, não stack trace.
- **Out of scope confirmado:** hospedagem do download no servidor; playlists; legendas; histórico;
  contas; assinatura de código; qualquer forma de burlar detecção de bot (proxy, cookies de conta
  de terceiro, spoof de cliente).

---

## Fontes consultadas (2026-07-20)

- [YouTube doesn't have Access-Control-Allow-Origin header — fent/node-ytdl-core#75](https://github.com/fent/node-ytdl-core/issues/75)
- [Direct "googlevideo.com" cdn link — fent/node-ytdl-core#1045](https://github.com/fent/node-ytdl-core/discussions/1045)
- [YouTube video download fails due to bot detection — yt-dlp#13067](https://github.com/yt-dlp/yt-dlp/issues/13067)
- [My ip blocked by youtube — yt-dlp#9890](https://github.com/yt-dlp/yt-dlp/issues/9890)
- [HTTP 403 with data center IP or VPN/proxy — yt-dlp#10340](https://github.com/yt-dlp/yt-dlp/issues/10340)
- [Update to GitHub Actions pricing — GitHub Changelog](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)
- [Is there a limit on usage by public repos? — GitHub Community #70492](https://github.com/orgs/community/discussions/70492)
- [YouTube Disabled — The Chrome Web Store does not allow Downloading](https://forum.videohelp.com/threads/389406-Youtube-Disabled-The-Chrome-Web-Store-does-not-allow-Downloading)

---

**Próximo passo:** `/define .claude/sdd/features/BRAINSTORM_ARQUITETURA_ENTREGA.md`

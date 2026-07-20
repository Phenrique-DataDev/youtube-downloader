<!-- status: active -->

# Contexto do projeto

> Preenchido por `/setup` em 2026-07-20. Fonte de verdade de stack, domínio e convenções.

---

## Identidade

| Campo | Valor |
|-------|-------|
| Nome do projeto | `youtube-downloader` |
| Domínio | Web app público para baixar vídeo **ou** áudio do YouTube (formato selecionável) |
| Repositório | `C:\Users\Pedro\Documents\Claude\youtube-downloader` (git local, branch `master`, sem remoto ainda) |

## Requisitos que moldam tudo

Restrições fixas, definidas no `/setup` — qualquer decisão de arquitetura precisa respeitá-las:

| Requisito | Consequência |
|-----------|--------------|
| **Público** — qualquer pessoa abre o link e usa | Não pode exigir conta, token próprio ou setup do usuário |
| **Sem instalação** — roda no browser | Descarta app local/CLI como entrega principal |
| **Custo zero** — sem servidor pago | Restringe a free tiers e a compute do próprio GitHub |
| **Vídeo ou áudio, selecionável** | Precisa de transcodificação/extração (ffmpeg), não só download bruto |

## Stack

| Camada | Tecnologia | Notas |
|--------|------------|-------|
| Linguagem principal | TypeScript | |
| Runtime / framework | Node.js + npm | framework de UI a definir no DESIGN |
| Mídia | `yt-dlp` + `ffmpeg` | executados fora do browser — onde, é a decisão em aberto abaixo |
| Dados | — | sem persistência prevista até agora |
| Infra / CI | GitHub Actions | lint + testes em push/PR; publicação do frontend em GitHub Pages |

## Arquitetura — decidida em 2026-07-20

**App local com Web UI, distribuído como executável único.** O usuário baixa um binário de um
GitHub Release, roda, e a interface abre no browser via `localhost`; o download sai do **IP
residencial** dele. GitHub Pages hospeda **landing e instruções**, não o app.

**Por quê:** o download precisa sair de um IP residencial. Browser puro esbarra em CORS
(`*.googlevideo.com` só libera a origem `youtube.com`); GitHub Actions e free tiers rodam em IPs de
datacenter, que a detecção de bot do YouTube bloqueia; extensão de browser é proibida pela política
da Chrome Web Store. Isso tornou **"sem instalação"** a restrição a ceder — custo zero e alcance
público seguem intactos.

Análise completa, alternativas e fontes: [`BRAINSTORM_ARQUITETURA_ENTREGA.md`](../sdd/features/BRAINSTORM_ARQUITETURA_ENTREGA.md).

## Riscos transversais a considerar no brainstorm

- **Abuso**: serviço público e anônimo de download é alvo de automação em massa — custo zero e
  ausência de rate limit são incompatíveis.
- **ToS / legal**: baixar do YouTube conflita com os Termos de Serviço da plataforma; um serviço
  público exposto tem superfície diferente de uma ferramenta pessoal.
- **Fragilidade do `yt-dlp`**: quebra com frequência quando o YouTube muda; exige estratégia de
  atualização da dependência.

## Convenções de código

- Estilo / lint: ESLint + Prettier (ou Biome — confirmar no DESIGN)
- Testes: a definir na stack de frontend escolhida (Vitest é o candidato natural)
- Versionamento: **Conventional Commits** (`feat:`, `fix:`, `chore:`…), mensagens em pt-BR
- `main`/`master` protegida: trabalho em branch de feature; merge só com confirmação explícita

---

## Área de trabalho

- A **raiz do projeto é o workspace** — o layout concreto (`src/`, `tests/`, etc.) será derivado
  do framework escolhido no DESIGN; nada foi criado ainda.
- O que **chega de fora** (specs, referências, solicitações) vai em `inbox/` — ver `inbox/_ABOUT.md`.
- Artefatos SDD gerados vão em `.claude/sdd/`; documentação humano×LLM em `docs/`.

## Como os agentes usam este arquivo

- `status: template` → avisar que o projeto não foi configurado e sugerir `/setup`.
- `status: active` → ler como **fonte de verdade** de stack, domínio e convenções.

## Onde buscar mais contexto

| Necessidade | Local |
|-------------|-------|
| Contrato canônico de agentes | `AGENTS.md` (raiz) |
| Fases SDD | `.claude/rules/workflow-sdd.md` |
| CLI-first (otimização) | `.claude/rules/cli-first.md` |
| Roteamento de agentes | `.claude/rules/agent-routing.md` |
| Taxonomia da KB | `.claude/rules/kb-taxonomy.md` |
| Templates SDD | `.claude/sdd/templates/` |

<!-- status: active -->

# Contexto do projeto

> Preenchido por `/setup` em 2026-07-20. Fonte de verdade de stack, domínio e convenções.

---

## Identidade

| Campo | Valor |
|-------|-------|
| Nome do projeto | `youtube-downloader` |
| Domínio | Web app público para baixar vídeo **ou** áudio do YouTube (formato selecionável) |
| Repositório | [`Phenrique-DataDev/youtube-downloader`](https://github.com/Phenrique-DataDev/youtube-downloader) — **privado**. Local em `C:\Users\Pedro\Documents\Claude\youtube-downloader`, branch default `main` |

## Requisitos que moldam tudo

Restrições fixas — qualquer decisão de arquitetura precisa respeitá-las. Revisadas em **2026-07-21**,
quando o alcance pretendido foi esclarecido (ver *Público-alvo* logo abaixo):

| Requisito | Consequência |
|-----------|--------------|
| **Poucas pessoas conhecidas**, sem experiência em programação | Não pode exigir conta nem setup; mas **não** precisa aguentar escala nem uso anônimo em massa |
| **Fluxo de link salvo** — depois da 1ª execução, abrir o favorito e usar | O endereço da UI precisa ser **estável entre execuções**; nada que expire sozinho no caminho feliz |
| **Nada aparecendo sem ser pedido** — sem janelas nem abas surgindo | O app não pode abrir navegador em toda subida, nem deixar janela de console visível |
| **Custo zero** — sem servidor pago | Restringe a free tiers e à compute do próprio GitHub |
| **Vídeo ou áudio, selecionável** | Precisa de transcodificação/extração (ffmpeg), não só download bruto |
| ~~**Sem instalação** — roda no browser~~ | **Cedida em 2026-07-20** — ver *Arquitetura* abaixo: o download precisa sair de um IP residencial |

### Público-alvo — esclarecido em 2026-07-21

O `/setup` registrou *"público — qualquer pessoa abre o link e usa"*. Isso **não** descreve a
intenção: o alvo é um **grupo pequeno e conhecido**, com pouca ou nenhuma experiência técnica.

A diferença não é cosmética. Ela **relaxa** a preocupação com abuso e escala (não há serviço anônimo
exposto a automação em massa) e **aperta** a exigência de fluxo amigável: quem usa não vai
diagnosticar uma janela de console, um link que expirou ou um processo esquecido rodando. Onde a
escolha for entre robustez a escala e simplicidade de uso, **vale a simplicidade**.

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

> Revisados em 2026-07-21 junto com o público-alvo. Dois deles encolheram bastante ao deixar de
> ser um serviço público e anônimo — registrar isso evita continuar projetando contra um risco
> que o produto não corre mais.

- ~~**Abuso**~~ → **baixo**. O app roda na máquina de cada pessoa, o grupo é pequeno e conhecido, e
  não há endpoint compartilhado exposto. Não há o que sofrer automação em massa. Rate limit deixa
  de ser requisito.
- **ToS / legal**: baixar do YouTube conflita com os Termos de Serviço da plataforma. A superfície
  é a de uma ferramenta usada por poucos indivíduos, não a de um serviço público em nome do autor
  — mas o conflito com os ToS **não desaparece** por ser pequeno.
- **Fragilidade do `yt-dlp`**: quebra com frequência quando o YouTube muda; exige estratégia de
  atualização da dependência. **Inalterado** — independe do tamanho do público.
- **Usuário não-técnico** (novo): qualquer falha precisa se explicar sozinha na tela. Não há a quem
  recorrer, e ninguém vai ler log nem console. Erro silencioso é o pior modo de falha deste produto.

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

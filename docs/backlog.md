# Backlog

> O que está identificado mas ainda **não** foi feito. Distinto das pendências do
> [BUILD_REPORT](../.claude/sdd/reports/BUILD_REPORT_DOWNLOADER_LOCAL.md), que são débitos de uma
> feature específica: aqui fica trabalho que ainda não entrou em nenhuma fase SDD.

## Parte visual — adiado deliberadamente (2026-07-21)

Trabalho de interface e apresentação, agrupado porque compartilha a mesma disciplina (o subagent
`designer`) e porque nenhum item bloqueia o funcionamento do app.

| Item | Estado | Nota |
|------|--------|------|
| **Landing `site/`** | não existe | Previsto no DESIGN (`site/`, reaproveita o CSS da UI). **Último item do build** que falta. Só vai ao ar com o repositório público (Pages exige repo público no plano Free) |
| **README do projeto** | ausente | Repositório sem README. Relevante ao publicar — é a primeira coisa que se lê |
| **Refino da UI local** | funcional, não refinada | A UI serve o propósito e foi verificada; nunca passou por uma revisão de design |

**Por que a landing importa além da estética:** o `.exe` não é assinado (certificado descartado por
custo zero), então todo usuário verá o aviso do SmartScreen. A landing é a mitigação prevista — ela
precisa existir **antes** de divulgar o download, não depois.

**Dependência circular a resolver:** o plano de publicação do DEFINE diz "público só depois de
implementado e testado", mas o último item pendente (a landing) precisa do Pages, que precisa do
repositório público. Ou se constrói a landing antes e publica tudo de uma vez, ou se publica com
uma janela sem página de instruções.

## Infraestrutura

| Item | Estado | Nota |
|------|--------|------|
| **CI de lint/testes** | não existe | O `project-context` prevê "lint + testes em push/PR". Hoje o único workflow é o `pin-ffmpeg.yml` |
| **Workflow de release** | não existe | DESIGN prevê build disparado por tag, publicando `.exe` + SHA256 |
| **Cross-compile Linux→Windows** | não verificado | Bun documenta suporte; exercitamos só Windows→Windows (ADR 0002). A CI de release depende disso |
| **Bun como dependência de build** | não registrado | Instalado globalmente nesta máquina em 2026-07-21; falta registrar no onboarding |

## Ao publicar o repositório

| Item | Nota |
|------|------|
| **Migrar o pin do ffmpeg** | Do BtbN para Release próprio — encerra a dívida da tag podada (ADR 0001). Reassume a obrigação GPL |
| **Confirmar a licença** | MIT foi escolhida como default em 2026-07-21; é decisão do dono e pode mudar antes de publicar |

## Fechados

| Item | Quando |
|------|--------|
| ~~Bootstrap automático do ffmpeg~~ | 2026-07-21 — ADR 0001 |
| ~~Empacotamento `.exe` (SC-6)~~ | 2026-07-21 — ADR 0002 |
| ~~Varredura de segredos no histórico~~ | 2026-07-21 — limpo: 15 commits, 1 autor, nenhum segredo |
| ~~Fixture de teste com vídeo protegido~~ | 2026-07-21 — trocado por obra Creative Commons; ver abaixo |
| ~~LICENSE ausente~~ | 2026-07-21 — MIT + nota sobre dependências não redistribuídas |

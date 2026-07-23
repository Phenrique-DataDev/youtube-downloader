# Backlog

> O que está identificado mas ainda **não** foi feito. Distinto das pendências do
> [BUILD_REPORT](../.claude/sdd/reports/BUILD_REPORT_DOWNLOADER_LOCAL.md), que são débitos de uma
> feature específica: aqui fica trabalho que ainda não entrou em nenhuma fase SDD.

## Parte visual — construída em 2026-07-21

Os três itens saíram (ver **Fechados**). O que sobra desta seção não é mais trabalho de
interface: é **publicação**.

| Item | Estado | Nota |
|------|--------|------|
| **Publicar a landing no Pages** | escrita, fora do ar | `site/` existe e é self-contained. Pages exige repositório público no plano Free — depende da decisão de publicar, não de mais design |
| **Link de release na landing** | ausente por honestidade | A ação primária hoje leva aos passos de build, porque não há release publicado. Vira link real quando o **Workflow de release** (abaixo) existir |

**Dependência circular — resolvida na prática.** O DEFINE dizia "público só depois de implementado
e testado", enquanto a landing precisava do Pages, que precisa do repo público. Foi resolvida pelo
primeiro caminho previsto: **a landing foi construída antes**, então a publicação pode acontecer de
uma vez, sem janela em que o download exista sem página de instruções.

**Por que a landing importa além da estética:** o `.exe` não é assinado (certificado descartado por
custo zero), então todo usuário verá o aviso do SmartScreen. A landing é a mitigação prevista — e
por isso o aviso ganhou seção própria nela, não uma nota de rodapé. Ela precisa estar **no ar antes**
de o download ser divulgado.

## Infraestrutura

| Item | Estado | Nota |
|------|--------|------|
| **CI de lint/testes** | não existe | O `project-context` prevê "lint + testes em push/PR". Hoje o único workflow é o `pin-ffmpeg.yml` |
| **Workflow de release** | não existe | DESIGN prevê build disparado por tag, publicando `.exe` + SHA256 |
| **Cross-compile Linux→Windows** | não verificado | Bun documenta suporte; exercitamos só Windows→Windows (ADR 0002). A CI de release depende disso |
| **Bun como dependência de build** | registrado no projeto, ausente do onboarding | **Verificado 2026-07-23:** está no [README](../README.md) (*"para gerar o `.exe`, também Bun"*) e em `scripts/build.mjs` (`resolverBun()` tenta `BUN_PATH`, o PATH e o shim global do npm; sem nenhum, falha com instrução de instalação). Máquina nova constrói, desde que instale. O que falta é menor: `package.json` declara só `engines.node`, e o Bun não entra no instalador do onboarding |

## Ao publicar o repositório

| Item | Nota |
|------|------|
| **Migrar o pin do ffmpeg** | Do BtbN para Release próprio — encerra a dívida da tag podada (ADR 0001). Reassume a obrigação GPL |
| **Confirmar a licença** | MIT foi escolhida como default em 2026-07-21; é decisão do dono e pode mudar antes de publicar |
| **Rótulo de licença no GitHub** | **Verificado 2026-07-23:** o `LICENSE` é MIT íntegro e o `package.json` declara `"license": "MIT"`, mas a API do GitHub reporta `Other`. Causa: a seção "Dependências de terceiros" após o `---` — o detector casa o arquivo inteiro contra o texto canônico e conteúdo extra derruba a confiança. **Não é defeito:** essa seção registra que o projeto não redistribui `yt-dlp`/`ffmpeg` e que a obrigação da GPL volta se ele passar a hospedar o pacote (ver *Migrar o pin do ffmpeg*, acima). Se o rótulo importar ao publicar, mover a seção para `NOTICE`/`THIRD-PARTY.md` e deixar o `LICENSE` puro — não apagá-la |

## Fechados

| Item | Quando |
|------|--------|
| ~~Bootstrap automático do ffmpeg~~ | 2026-07-21 — ADR 0001 |
| ~~Empacotamento `.exe` (SC-6)~~ | 2026-07-21 — ADR 0002 |
| ~~Varredura de segredos no histórico~~ | 2026-07-21 — limpo: 15 commits, 1 autor, nenhum segredo |
| ~~Fixture de teste com vídeo protegido~~ | 2026-07-21 — trocado por obra Creative Commons; ver abaixo |
| ~~LICENSE ausente~~ | 2026-07-21 — MIT + nota sobre dependências não redistribuídas |
| ~~README do projeto~~ | 2026-07-21 — commit `0ef85d0` |
| ~~Refino da UI local~~ | 2026-07-21 — commit `d8e7c9c`; dark-only, hierarquia por espaço, sem scroll em 1440×900 |
| ~~Landing `site/`~~ | 2026-07-21 — commit `d8e7c9c`; mesma linguagem visual da UI, self-contained. **Existe, mas ainda não está no ar** — ver acima |
| ~~Escolha de formato de áudio (SHOULD do DEFINE)~~ | 2026-07-21 — commit `1596ea5`; MP3 ou M4A sem reconversão. O SHOULD estava pela metade e nenhum AT o guardava |

# BUILD REPORT: Ciclo de vida — leva 1

| Atributo | Valor |
|----------|-------|
| **Feature** | CICLO_DE_VIDA (leva 1 de 2) |
| **Data** | 2026-07-21 |
| **DESIGN** | [DESIGN_CICLO_DE_VIDA.md](../features/DESIGN_CICLO_DE_VIDA.md) |
| **Branch** | `feat/ciclo-de-vida-leva1` |
| **Status** | ✅ COMPLETE (para o escopo da leva 1) |

---

## Resumo

Entregues os dois itens que destravam o fluxo do link salvo: **o token saiu da URL** e **duas
execuções deixaram de virar dois servidores**. Console escondido, botão Encerrar e autostart ficaram
para a leva 2, por corte de escopo acordado antes do build.

O corte é coerente: sem esconder o console, fechar a janela continua sendo a saída do app, então
nada ficou sem caminho de uso.

## Arquivos

### Criados

| Arquivo | O que é |
|---------|---------|
| `src/lifecycle/instancia.ts` | Handshake de identidade, detecção de modo e as decisões puras de arranque |
| `tests/unit/lifecycle-instancia.test.ts` | 15 testes do módulo acima |

### Alterados

| Arquivo | Mudança |
|---------|---------|
| `src/server/guards.ts` | `procedenciaEhPermitida()` — avalia `Sec-Fetch-Site` |
| `src/server/http.ts` | Rotas `/api/identidade` e `/api/sessao`; `?t=` deixa de autenticar; checagem de procedência; `url` sem token; campo `enderecoEstavel` |
| `src/main.ts` | Sonda de instância antes de subir; abertura de navegador condicionada ao modo; log da decisão de arranque |
| `src/ui/app.js` | Busca o token em `/api/sessao` em vez de lê-lo da URL; aviso de endereço instável |
| `src/ui/index.html` | Bloco `aviso-endereco` |
| `tests/unit/ui-bootstrap.test.ts` | URL limpa; default de `/api/sessao`; 3 testes novos |
| `tests/unit/guards.test.ts` | 8 testes de `procedenciaEhPermitida` |
| `tests/integration/server.test.ts` | Blocos de sessão, identidade e AT-100; teste de contrato de URL invertido |

## Verificação — saídas reais

```
$ npm run verify
 Test Files  10 passed (10)
      Tests  195 passed (195)
```
(typecheck e lint passaram — `verify` encadeia `tsc --noEmit && eslint . && vitest`)

```
$ npx vitest run --project integration
 Test Files  2 passed | 1 skipped (3)
      Tests  39 passed | 6 skipped (45)

$ npx prettier --check src tests
All matched files use Prettier code style!
```

### Prova por mutação

Verde não prova guarda: cada defesa nova foi removida e os testes tinham de morrer.

```
MUTAÇÃO 1 — sem checagem de Sec-Fetch-Site
  × recusa pedido de outra origem pelo Sec-Fetch-Site
  × a recusa por procedencia vale mesmo com token valido      → 2 failed | 32 passed

MUTAÇÃO 2 — volta a aceitar o token pela querystring
  × o token NAO autentica mais pela querystring               → 1 failed | 33 passed

MUTAÇÃO 3 — qualquer 200 vira "nossa instância"
  × recusa 200 vazio
  × recusa outro app
  × servico alheio que responde 200 => terceiro, nunca nossa  → 3 failed | 12 passed
```

Arquivos restaurados e conferidos com `diff` — idênticos aos originais.

### Prova de ponta a ponta (AT-101)

Não bastava testar os módulos: a fiação do `main.ts` é o que estava quebrado. Duas execuções reais,
em modo `--silencioso` (que não abre navegador):

```
$ curl http://127.0.0.1:47821/api/identidade
{"app":"youtube-downloader","pid":11244}

$ time node --experimental-strip-types src/main.ts --silencioso
real  0m0.158s          ← saiu sem subir servidor
exit code de B: 0

$ Get-NetTCPConnection -LocalPort 47821 -State Listen
11244                   ← só a instância A

log:
  arranque :: modo=silencioso decisao=subir porta=47821 estavel=true
  arranque :: modo=silencioso decisao=ceder
```

Após encerrar A, a porta ficou livre — sem processo órfão.

## Acceptance Tests

| AT | Estado | Evidência |
|----|--------|-----------|
| AT-100 link salvo funciona | ✅ | `AT-100 — o link salvo sobrevive a nova execucao`: duas execuções na mesma porta, token muda, endereço não, e a UI opera com o token novo |
| AT-101 2ª execução silenciosa | ✅ | E2E acima: 0,158 s, exit 0, 1 processo |
| AT-101b sobe silencioso sem aba | ✅ | `deveAbrirNavegador('silencioso') === false` + e2e (nenhum navegador abriu) |
| AT-101c sobe pelo atalho com aba | ✅ | `deveAbrirNavegador('explicito') === true` |
| AT-102 instância morta não bloqueia | ✅ | `porta vazia => ninguem`; a decisão é sempre "subir" quando ninguém atende — não há lockfile para ficar obsoleto |
| AT-103 serviço alheio | ✅ | `servico alheio que responde 200 => terceiro, nunca nossa` (+ mutação 3) |
| AT-108 sessão inválida ainda explica | ✅ | Os 4 testes de `ui-bootstrap` continuam passando, agora com 3 a mais |
| AT-109 CSRF barrado | ✅ | Ausência de CORS em 4 rotas; `?t=` recusado; `cross-site` → 403 (+ mutações 1 e 2) |
| AT-104 encerrar | ⏸ leva 2 | — |
| AT-105 encerrar durante download | ⏸ leva 2 | — |
| AT-106 console some | ⏸ leva 2 | — |
| AT-107 falha visível | ⏸ leva 2 | — |
| AT-110 autostart reversível | ⏸ leva 2 | — |

## Desvios do DESIGN

| Desvio | Por quê |
|--------|---------|
| `/api/sessao` devolve **também** `enderecoEstavel` | O DESIGN previa só `{ token }` e tratava o aviso de porta alternativa como assunto separado. Juntar evitou uma segunda rota para um booleano que a UI já busca no mesmo instante |
| `detectarModo`/`--silencioso` entraram na leva 1 | O autostart é leva 2, então hoje **nada** passa `--silencioso` em produção. Mantive porque é o encaixe da leva 2 e porque tornou o teste e2e possível sem abrir navegador — sem isso, AT-101 só teria prova indireta |
| Desvio do AT-101 (registrado no DESIGN) implementado | Clicar no atalho com o app rodando **abre a aba**. Confirmado pelo `deveAbrirNavegador`; o AT-101 literal ("nunca abre") vale só para o modo silencioso |

## Mudança de contrato

`ServidorLocal.url` deixou de conter o token. O teste `a URL de abertura ja carrega o token` foi
**invertido**, não apagado — ele agora cobra o oposto e explica no comentário por que o contrato
mudou. Quem depender de `url` para autenticar quebra, e deve quebrar.

## Issues e blockers

Nenhum blocker.

| Observação | Nota |
|------------|------|
| A sonda custa até 300 ms no arranque comum | Fica dentro do SC (< 500 ms). Medido: o caso "ninguém atende" resolve em ~2 ms via conexão recusada; os 300 ms só valem para porta que aceita e não responde |
| Nenhum teste cobre o `abrirNoBrowser` de fato abrindo | Continua assim desde o BUILD original — é `spawn` de `cmd /c start`. A decisão *se* abre está coberta; o *ato* de abrir, não |
| CI não roda nada disto | Segue valendo: o único workflow é o `pin-ffmpeg.yml`. Item aberto no `backlog.md` |

## Status final

✅ **COMPLETE** para a leva 1. O fluxo do link salvo está entregue e provado; leva 2 (console,
Encerrar, autostart) permanece definida no DESIGN e não foi iniciada.

# BUILD REPORT: Ciclo de vida — leva 2

| Atributo | Valor |
|----------|-------|
| **Feature** | CICLO_DE_VIDA (leva 2 de 2) |
| **Data** | 2026-07-22 |
| **DESIGN** | [DESIGN_CICLO_DE_VIDA.md](../features/DESIGN_CICLO_DE_VIDA.md) |
| **Leva anterior** | [BUILD_REPORT_CICLO_DE_VIDA.md](BUILD_REPORT_CICLO_DE_VIDA.md) |
| **Branch** | `feat/ciclo-de-vida-leva2` |
| **Commits** | `810283e` (implementação), `a164705` (fix do abort + cobertura) |
| **Status** | ✅ COMPLETE, com 2 lacunas de verificação declaradas abaixo |

---

## Resumo

Entregues os três itens que faltavam para o app ter começo e fim: a **janela de console some**, existe
um **botão Encerrar** na UI, e o **autostart** é opt-in e reversível. Com isso a leva 1 deixa de
depender de "feche a janela preta" como saída.

O trabalho revelou um **defeito pré-existente** no `responderSse` que ia além do escopo da leva:
nenhum download era abortado quando a conexão caía. Corrigido aqui porque o AT-105 não tinha como ser
entregue sem isso.

## Arquivos

### Criados

| Arquivo | O que é |
|---------|---------|
| `src/lifecycle/console.ts` | `FreeConsole()` via `bun:ffi` + caixa nativa (`MessageBoxW`) para falha de arranque |
| `src/lifecycle/autostart.ts` | Valor em `HKCU\...\Run` via `reg.exe`, opt-in e reversível |
| `scripts/verificar-console.mjs` | Verificação do AT-106 sob Bun — o cabeçalho de `console.ts` prometia este arquivo, que não existia |
| `tests/unit/lifecycle-autostart.test.ts` | 24 testes |
| `tests/unit/lifecycle-console.test.ts` | 15 testes |

### Alterados

| Arquivo | Mudança |
|---------|---------|
| `src/server/http.ts` | Rotas `/api/encerrar` e `/api/autostart`; **fix do `AbortSignal`** (ver abaixo) |
| `src/main.ts` | Fiação de `encerrar`/`autostart`; `esconderConsole()` após o servidor subir; `avisarFalhaFatal()` no `catch` |
| `src/ui/index.html`, `app.js`, `app.css` | Rodapé com o alternador de autostart e o botão Encerrar |
| `tests/integration/server.test.ts` | AT-104, AT-105, AT-110 |

## O defeito encontrado — `AbortSignal` nunca disparava

Descoberto ao escrever o teste do AT-105: o teste falhou, e a causa era do código de produção.

`responderSse` registrava `req.on('close', …)` **depois** de `lerJson(req)` ter consumido o corpo
inteiro. Com o corpo terminado o `IncomingMessage` já está destruído, então o listener ficava ligado a
um evento **que já passou**. Medido em probe isolado:

```
apos abort do cliente -> req.on(close) disparou: false | res.on(close) disparou: true
req.destroyed no momento do registro: true
```

| Consequência | Origem |
|---|---|
| Encerrar com download em curso não abortava o download | leva 2 (AT-105) |
| **Fechar a aba também não** — `baixar` corria até o fim com `aborted=false`, deixando o `yt-dlp` órfão | **pré-existente, do BUILD original** |

A segunda é a mais grave e é o oposto do que o comentário de `responderSse` prometia. Correção:
`res.on('close', …)` — o `res` permanece aberto enquanto o SSE dura. Efeito colateral: `req` virou
parâmetro morto de `responderSse` e saiu da assinatura (acusado pelo `tsc`, não pela revisão).

## Verificação — saídas reais

```
$ npm run verify
 Test Files  12 passed (12)
      Tests  231 passed (231)

$ npx vitest run --project integration
 Test Files  2 passed | 1 skipped (3)
      Tests  57 passed | 6 skipped (63)

$ npx prettier --check src tests scripts
All matched files use Prettier code style!
```

| Suíte | Leva 1 | Leva 2 |
|---|---|---|
| unit | 195 | **231** (+36) |
| integração | 39 | **57** (+18) |

Não-flakiness: 5 rodadas embaralhadas de cada projeto (`--sequence.shuffle`, seeds 11/22/33/44/55),
contagens estáveis nas dez. Nenhum teste usa `sleep` fixo — a espera é sempre por condição
(`esperarAte`). O `reg.exe` é mockado em 100% dos testes de autostart, contra
`HKCU\...\youtube-downloader-teste\Run`, com um teste que reprova se qualquer chamada tocar a chave
real.

### Prova por mutação

Verde não prova guarda: cada defesa foi removida e os testes tinham de morrer.

| # | Mutação | Testes mortos |
|---|---|---|
| M1 | `reg query` código 1 vira exceção | **8** |
| M2 | `alternarAutostart` devolve o desejado, não o relido | **3** |
| M3 | `montarComando` sem aspas | **3** |
| M4 | `shell: true` no `execFile` | **1** |
| M5 | `autostartLigado` só pelo exit code | **1** |
| M6 | `desligarAutostart` sem releitura | **1** |
| M7 | `paraUtf16` big-endian | **8** |
| M8 | `paraUtf16` sem terminador NUL | **8** |
| M9 | **sem `setImmediate` em `/api/encerrar`** | **0 — SOBREVIVEU** |
| M10 | `/api/autostart` devolve o pedido, não o estado real | **1** |
| M11 | `ligado` avaliado por truthy | **2** |
| M12 | some o 501 de `/api/encerrar` | **1** |
| M13 | some o 501 de `/api/autostart` | **1** |
| M14 | `/api/encerrar` sem exigir token | **1** |
| M15 | **`res.on('close')` de volta para `req.on('close')`** | **1** — o AT-105 |

Arquivos restaurados e conferidos com `diff` — idênticos aos originais.

### AT-106 verificado sob Bun, não por proxy

Bun 1.3.14 instalado. O script rodou com console real (via `Start-Process`, porque o shell da sessão
não tem console anexado):

```
.. GetConsoleWindow() antes: 4393068
.. esconderConsole() devolveu: true
.. GetConsoleWindow() depois: null
OK AT-106 verificado: a janela sumiu de fato.        exit=0
```

Os caminhos de recusa também foram exercitados: sob Node → `exit=2`; sem janela anexada → `exit=4`.
Nenhum finge sucesso.

### Decisão de FFI confirmada contra a doc

`avisarFalhaFatal` declara `MessageBoxW` com `FFIType.cstring` e passa um buffer **UTF-16LE**, o que
parecia truncar no primeiro byte nulo. Não trunca: pela doc do Bun, `cstring` em `args` é **tratado
como ponteiro cru** — a coerção para string só vale em `returns`.
_(fonte: context7, `/oven-sh/bun`, `docs/runtime/ffi.mdx`, verificado 2026-07-22)_

## Acceptance Tests

| AT | Estado | Evidência |
|----|--------|-----------|
| AT-104 encerrar | ✅ | `responde 202 integro E SO ENTAO desliga` + porta volta a aceitar bind em < 2 s; 501 sem manipulador; exige token; recusa cross-site |
| AT-105 encerrar durante download | ✅ | `o AbortSignal do download dispara quando o servidor e encerrado` — morre com M15 |
| AT-106 console some | ✅ | `verificar-console.mjs` sob Bun: `GetConsoleWindow()` não-nulo → `null` |
| AT-107 falha visível | ⚠️ **parcial** | Só o contrato "nunca lança" sob Node. A chamada nativa real não é exercitada — ver lacunas |
| AT-110 autostart reversível | ✅ | Ligar → valor existe; desligar → some; estado sempre **relido** do registro (M2, M10) |

## Lacunas de verificação — declaradas, não mascaradas

1. **O `setImmediate` de `/api/encerrar` é infalsificável hoje (M9).** Removido, os 57 testes seguem
   verdes. Um e2e com `process.exit(0)` real em subprocesso (3 rodadas com, 3 sem) devolveu o
   `202 {"encerrando":true}` íntegro nas seis: um corpo pequeno escoa para o socket antes de o
   processo morrer. A defesa é **correta por intenção** mas não está provada — os comentários dos
   testes foram corrigidos para não reivindicarem cobertura inexistente. **Não contar como coberta.**
2. **AT-107 não tem prova da chamada nativa.** O DESIGN previa injeção da dependência de UI nativa
   para verificá-la sem abrir caixa de verdade; o código atual não oferece esse ponto de injeção.
   Fechar isso é mudança de produção, não de teste — fica como item consciente.

Menores, herdadas da leva 1 e inalteradas: o `abrirNoBrowser` não é testado no *ato* de abrir, e o CI
não roda nada disto (só `pin-ffmpeg.yml` — item aberto no `backlog.md`).

## Desvios do DESIGN

| Desvio | Por quê |
|--------|---------|
| Fix do `AbortSignal` em `responderSse` | Fora do escopo declarado da leva, mas o AT-105 não tinha como ser entregue sem ele. O bug atingia também o fechar-a-aba, que nunca funcionou desde o BUILD original |
| `esconderConsole()` é chamado **depois** do servidor subir | Amarrado de propósito: liberar o console apaga `console.log`/`console.error`. Falha anterior a esse ponto vai para a caixa nativa, que persiste na tela |

## Correção ao relatório da leva 1

O [`BUILD_REPORT_CICLO_DE_VIDA.md`](BUILD_REPORT_CICLO_DE_VIDA.md) encerra afirmando que a leva 2
*"permanece definida no DESIGN e não foi iniciada"*. Isso deixou de ser verdade em 2026-07-22. O
relatório da leva 1 **não foi editado** — relatório é registro do que se sabia quando foi escrito;
esta seção é a errata.

## Issues e blockers

Nenhum blocker. A feature CICLO_DE_VIDA está completa nas duas levas.

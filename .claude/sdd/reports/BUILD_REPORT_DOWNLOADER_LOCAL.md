# BUILD REPORT: Downloader local com Web UI

> Relatório da implementação conforme o DESIGN.

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | DOWNLOADER_LOCAL |
| **Data** | 2026-07-20 |
| **DESIGN** | [DESIGN_DOWNLOADER_LOCAL.md](../features/DESIGN_DOWNLOADER_LOCAL.md) |
| **Branch** | `feat/downloader-local` |
| **Commits** | `9f326e1`, `be35685`, `3f2af8e`, `5cfb4d4`, `ead80bd`, `1205beb`, `81bdab1`, `4adb55c`, `eb77a61`, `0ef85d0`, `d8e7c9c`, `1596ea5`, `187c3c8` |

---

## Resumo

O app funciona ponta a ponta: sobe um servidor em `127.0.0.1`, abre o browser, sonda o vídeo e
baixa vídeo (MP4/H.264) ou áudio (MP3) pela conexão do próprio usuário. Verificado **rodando de
verdade** — dois downloads reais concluídos pela UI, com container e codec conferidos por
`ffprobe`, não pela extensão do arquivo.

> **Atualização 2026-07-21 (a)** — o bootstrap automático do ffmpeg foi implementado e verificado
> (AT-003 e SC-8 passaram de ⚠️ parcial para ✅). Ver [ADR 0001](../../../docs/adr/0001-fonte-do-ffmpeg.md);
> as seções abaixo trazem os números. O **empacotamento** também foi fechado (SC-6, ADR 0002),
> junto com um bug de assets que só existia depois de empacotar.

> **Atualização 2026-07-21 (b) — fechamento.** Três frentes encerraram o build:
>
> 1. **Landing `site/`** construída (`d8e7c9c`) — era o último item do DESIGN não construído e o
>    bloqueio nomeado na versão anterior deste relatório. Self-contained, mesma linguagem visual
>    da UI. Continua **fora do ar** por depender de repositório público (backlog, não build).
> 2. **UI refinada** (`d8e7c9c`) e **escolha de formato de áudio** (`1596ea5`) — o SHOULD do DEFINE
>    "painel avançado com escolha de resolução **e formato de áudio**" estava pela metade: o painel
>    oferecia resolução mesmo em áudio, onde o `montarArgsDownload` a descarta. Agora o painel
>    adapta por formato e há escolha real MP3 × M4A.
> 3. **SC-4 e SC-5 verificados** — nunca tinham linha de evidência nesta tabela (ver abaixo).
>
> **Correção de um teste falso-vermelho.** `tests/integration/server.test.ts` cobrava
> `toContain('teste')` — o fixture de disco. A asserção ficou falsa em `81bdab1` (ADR 0002), que
> **inverteu a precedência de propósito**: o mapa embutido vence o disco. O teste seguiu cobrando o
> comportamento antigo e falhava desde então, sem que nenhuma rodada registrada aqui o pegasse.
> Reescrito para provar o que sempre quis provar (`/` serve a UI sem token) **mais** o fallback de
> disco para nome não-embutido. Não era bug de produto — era o relatório afirmando verde sobre
> vermelho.

## Arquivos criados/alterados

27 arquivos, 3 826 linhas.

| Arquivo | Mudança | Notas |
|---------|---------|-------|
| `src/core/url.ts` | criado | Camada 1: valida antes de qualquer `spawn` (AT-005) |
| `src/core/selectors.ts` | criado | Contrato de invocação; funções puras, testáveis sem rede |
| `src/core/progress.ts` | criado | Lê `total_bytes` e `total_bytes_estimate` juntos; nunca `NaN` |
| `src/core/errors.ts` | criado | Classificação em 3 camadas + fallback obrigatório |
| `src/ytdlp/runner.ts` | criado | `spawn` com array, `shell:false`, registro de processos vivos |
| `src/ytdlp/probe.ts` | criado | Sonda `-J`; extrai resoluções reais do vídeo |
| `src/ytdlp/downloader.ts` | criado | Progresso + caminho final via arquivo |
| `src/bootstrap/hash.ts` | criado | SHA256; nome ausente da lista = **falha**, nunca "pula" |
| `src/bootstrap/deps.ts` | criado | Cache, update assíncrono, limpeza do `.old` |
| `src/bootstrap/paths.ts` | criado | Cache em `%LOCALAPPDATA%` |
| `src/server/guards.ts` | criado | Host, token em tempo constante, confinamento de caminho |
| `src/server/http.ts` | criado | HTTP + SSE + token de sessão |
| `src/ui/{index.html,app.css,app.js}` | criado | UI vanilla, sem framework |
| `src/main.ts` | criado | Amarra tudo; bootstrap em paralelo à UI |
| `tests/**` | criado | 165 unit + 24 integração local + 6 integração de rede |
| `site/{index.html,styles.css}` | criado 21/07 | Landing do Pages, self-contained, mesma linguagem visual da UI |
| `src/ui/*` | reescrito 21/07 | Refino visual (dark-only, sem scroll) + painel avançado que adapta por formato |
| `src/core/selectors.ts` | alterado 21/07 | `CodecAudio` (MP3 × M4A). O M4A exige `-f ba[ext=m4a]/ba`: sem ele o `-x` puxa opus e o ffmpeg **transcodifica** — medido em 8,7 MB/338 kbps a partir de origem de 3,3 MB, pior que o próprio MP3 |

## Verificação (saídas reais)

### Lint
```
$ npx eslint .
(sem saída — limpo)
```

### Type-check
```
$ npx tsc --noEmit
(sem saída — limpo)
```

### Testes
```
$ npx vitest run --project unit          # 2026-07-21, apos o fechamento
 Test Files  8 passed (8)
      Tests  165 passed (165)

$ npx vitest run --project integration
 Test Files  2 passed | 1 skipped (3)
      Tests  24 passed | 6 skipped (30)

$ TESTE_REDE=1 npx vitest run --project integration
 Test Files  2 passed (2)
      Tests  24 passed (24)
```

Os 6 pulados são os testes de rede, que só rodam com `TESTE_REDE=1` — dependem do YouTube e podem
falhar por AT-008. Rodados separadamente, passam todos.

### Auditoria de dependências
```
$ npm audit
found 0 vulnerabilities
```

## Verificação dos Acceptance Tests

| ID | Resultado | Evidência |
|----|-----------|-----------|
| AT-001 vídeo MP4 | ✅ | Download real pela UI; `ffprobe`: `format_name: mov,mp4...`, `codec_name: h264` + `aac`, 629 KB |
| AT-002 áudio MP3 | ✅ | Download real pela UI; `ffprobe`: `format_name: mp3`, `codec_name: mp3`, 139 kbps, sem trilha de vídeo |
| AT-003 1ª execução | ✅ | UI sobe antes do bootstrap e o botão fica desabilitado com aviso. O ffmpeg agora **baixa sozinho**: cache frio verificado em **2,6 s**, hash conferido, `ffmpeg -version` e `ffprobe -version` executam |
| AT-004 resolução | ✅ | `-S res:2160` num vídeo de 240p degradou e entregou arquivo, sem falhar (`tests/integration/pipeline.test.ts`) |
| AT-005 URL inválida | ✅ | 16 entradas inválidas + spy provando que **nenhum `spawn` ocorreu**; confirmado na UI com `vimeo.com` |
| AT-006 indisponível | ✅ | Fixture de stderr real + sonda real de id inexistente → `indisponivel` |
| AT-007 sem rede | ✅ | Fixture capturada com proxy morto; teste extra prova que **não depende do trecho localizado pelo Windows** |
| AT-008 rate limit | ⚠️ não verificado | Nunca reproduzido: o IP residencial não foi bloqueado (o resultado desejado). Fixture marcada `NAO_VERIFICADA`, vinda da doc. Testa-se a **lógica** de classificação, não a string real |
| AT-009 porta ocupada | ✅ | Teste ocupa a porta e o servidor escolhe outra e responde |
| AT-010 update | ✅ | `-U` real: downgrade forçado → volta, hash idêntico ao conhecido-bom |
| AT-011 encerramento | ✅ | Após matar o app: zero `yt-dlp.exe` e zero `ffmpeg.exe` órfãos (`tasklist`) |
| AT-012 sonda | ✅ | Spy prova `-J` antes de download e ausência de `--no-simulate`; teste de rede prova que a sonda não cria arquivo |
| AT-013 falha desconhecida | ✅ | stderr sintético → mensagem genérica; teste prova que `ERROR:` **não** vaza na mensagem da UI |

### Success Criteria

| ID | Resultado | Medição |
|----|-----------|---------|
| SC-1 arranque | ✅ | UI responde em < 1 s; bootstrap não bloqueia |
| SC-2/3 download | ✅ | 3 338 ms (MP4) e 2 612 ms (MP3), do log real |
| SC-4 zero deps manuais | ✅ | O `.exe` do Bun `--compile` embute runtime **e** UI — nada de Node instalado na máquina. As duas dependências externas chegam sozinhas na 1ª execução: **yt-dlp** de `yt-dlp/releases/latest` (`src/bootstrap/deps.ts:59`) e **ffmpeg** pinado por tag + SHA256. Cache frio medido em **2,6 s** (AT-003), com `ffmpeg -version`/`ffprobe -version` executando depois. Contagem de instalações exigidas do usuário: **0** |
| SC-5 falhas em pt-BR | ✅ | **8/8** categorias de `errors.ts` têm mensagem pt-BR acionável (linhas 82–121) e as de URL inválida (AT-005) também (`url.ts:39–78`). **Fallback genérico obrigatório** presente como categoria `desconhecido` (`errors.ts:115`), alcançada por qualquer stderr não reconhecido. **0 stack traces**: o stderr cru nunca vai à UI — `detalheDe` corta nas 3 últimas linhas e só aparece atrás de "ver detalhes"; `tests/unit/errors.test.ts:57` trava que `ERROR:` não vaza na mensagem. 16 testes verdes |
| SC-6 tamanho | ✅ | **94,0 MB** — 98 544 640 bytes, **remedido em 2026-07-21 17:13** após a UI nova e o formato de áudio (teto 120 MB), Bun `--compile`. Node SEA medido em 88,2 MB e descartado por custo de build — ADR 0002 |
| SC-7 update yt-dlp | ✅ | Roda em paralelo; log: `update yt-dlp :: ok` |
| SC-8 ffmpeg pinado | ✅ | Pinado por tag + SHA256 ancorado no código; download recusado se o hash não conferir. Vigiado diariamente pelo CI (`pin-ffmpeg.yml`) |

> **Ressalva honesta no SC-5.** Ele cobre AT-005…AT-009, e **AT-008 (rate limit) segue ⚠️ não
> verificado** — a fixture de stderr veio da documentação, não de um bloqueio real. O que está
> provado é a **lógica**: a categoria existe, tem mensagem pt-BR, e a ordem dos padrões é testada
> (rate-limit antes de indisponível, senão "isn't available, try again later" cairia no padrão
> errado e diria ao usuário que o vídeo sumiu quando bastava esperar). O que **não** está provado é
> que a string real do YouTube em 2026 case com o regex. Só se resolve sendo de fato bloqueado —
> vai para o SHIPPED como débito nomeado, não como critério silenciosamente dado por atingido.

## Desvios do design

| Desvio | Por quê |
|--------|---------|
| **`--print-to-file` no lugar de `--print`** | Medido: `--print` liga `--quiet` implicitamente e **suprime o progresso**. Mesmo com `--progress`, o canal `postprocess` continua mudo sob `--print` — a barra congelaria em 100% durante a conversão MP3, a falha exata que o segundo canal existe para evitar |
| **`--progress` acrescentado ao contrato** | Consequência do acima: sem ele o template fica configurado e não emite uma linha |
| ~~**ffmpeg não é baixado automaticamente**~~ | Fechado em 2026-07-21 — fonte escolhida por medição, versão e hash pinados (ADR 0001) |
| ~~**Empacotamento não executado**~~ | Fechado em 2026-07-21: os dois foram medidos e Bun escolhido (ADR 0002) |

## Issues e blockers

**Bugs encontrados e corrigidos durante o build** — nenhum deles previsto no DESIGN:

1. **Progresso suprimido** (dois bugs encadeados, acima). Pego pelo teste de integração real, não
   pelos unitários — os unitários verificavam o argv, que estava correto; o que estava errado era o
   comportamento do yt-dlp diante daquele argv.
2. **`[hidden]` derrotado por `display: grid`.** Uma regra de classe vence o atributo `hidden`.
   Painéis de sucesso e erro nasciam visíveis. Só apareceu **abrindo o app no browser** — nenhum
   teste pegaria.
3. **`parameter properties` não existem em JS.** O strip-only do Node rejeita
   `constructor(readonly x)` e o app não subia.
4. **`ECONNRESET` em corpo grande.** Responder 500 sem drenar o request mata o socket e derruba a
   conexão keep-alive seguinte. Corrigido com 413 + `req.resume()`.

**Pendências conhecidas:**

- ~~**ffmpeg manual.**~~ Resolvido em 2026-07-21 (ADR 0001).
- **URL do ffmpeg vai apodrecer.** O pin usa uma tag `autobuild-*` do BtbN, que é podada. É
  dívida assumida enquanto o repositório for privado (asset de Release privado não baixa sem
  token). Vigiada diariamente pelo CI, não esquecida — ao publicar o repo, migrar para Release
  próprio.
- **AT-008 sem fixture real.** Só se resolve se alguém for de fato bloqueado.
- **A-009 (runtime JS).** Aviso de depreciação segue válido, sem perda de formatos hoje.

## Status final

**Geral:** ✅ COMPLETO

Os três motivos do `🔄 IN PROGRESS` anterior foram fechados e **medidos**, não presumidos: o `.exe`
existe (94,0 MB, remedido hoje), o ffmpeg chega sozinho (2,6 s em cache frio) e a landing foi
construída. Todos os **8 Success Criteria** têm agora linha de evidência — SC-4 e SC-5 não tinham
nenhuma até este fechamento, o que significa que o relatório teria carimbado ✅ sobre dois critérios
nunca conferidos.

**O que ✅ aqui significa e o que não significa.** Significa: o DESIGN foi construído e verificado
rodando de verdade. **Não** significa que o produto está publicado — três pendências seguem
abertas no [backlog](../../../docs/backlog.md), e nenhuma é trabalho desta feature:

| Pendência | Natureza |
|-----------|----------|
| Landing no ar | Exige repositório público (Pages no plano Free) |
| Workflow de release + CI de lint/testes | Infraestrutura, nunca construída |
| AT-008 sem fixture real | Só se resolve sendo bloqueado de verdade |

---

**Próximo passo:** `/ship` — arquivar a feature levando as pendências acima como débito nomeado.

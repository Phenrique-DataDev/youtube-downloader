# BUILD REPORT: Downloader local com Web UI

> Relatório da implementação conforme o DESIGN.

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | DOWNLOADER_LOCAL |
| **Data** | 2026-07-20 |
| **DESIGN** | [DESIGN_DOWNLOADER_LOCAL.md](../features/DESIGN_DOWNLOADER_LOCAL.md) |
| **Branch** | `feat/downloader-local` |
| **Commits** | `9f326e1`, `be35685`, `3f2af8e`, `5cfb4d4`, `ead80bd` |

---

## Resumo

O app funciona ponta a ponta: sobe um servidor em `127.0.0.1`, abre o browser, sonda o vídeo e
baixa vídeo (MP4/H.264) ou áudio (MP3) pela conexão do próprio usuário. Verificado **rodando de
verdade** — dois downloads reais concluídos pela UI, com container e codec conferidos por
`ffprobe`, não pela extensão do arquivo.

**Falta para o release:** o empacotamento (`.exe`). O núcleo do produto está pronto e provado; a
distribuição não.

> **Atualização 2026-07-21** — o bootstrap automático do ffmpeg foi implementado e verificado
> (AT-003 e SC-8 passaram de ⚠️ parcial para ✅). Ver [ADR 0001](../../../docs/adr/0001-fonte-do-ffmpeg.md);
> as seções abaixo trazem os números. O empacotamento segue pendente.

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
| `tests/**` | criado | 146 unit + 18 integração local + 6 integração de rede |

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
$ npx vitest run
 Test Files  8 passed | 1 skipped (9)
      Tests  164 passed | 6 skipped (170)

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
| SC-6 tamanho | ⏳ não medido | Depende do empacotamento, que não foi feito |
| SC-7 update yt-dlp | ✅ | Roda em paralelo; log: `update yt-dlp :: ok` |
| SC-8 ffmpeg pinado | ✅ | Pinado por tag + SHA256 ancorado no código; download recusado se o hash não conferir. Vigiado diariamente pelo CI (`pin-ffmpeg.yml`) |

## Desvios do design

| Desvio | Por quê |
|--------|---------|
| **`--print-to-file` no lugar de `--print`** | Medido: `--print` liga `--quiet` implicitamente e **suprime o progresso**. Mesmo com `--progress`, o canal `postprocess` continua mudo sob `--print` — a barra congelaria em 100% durante a conversão MP3, a falha exata que o segundo canal existe para evitar |
| **`--progress` acrescentado ao contrato** | Consequência do acima: sem ele o template fica configurado e não emite uma linha |
| ~~**ffmpeg não é baixado automaticamente**~~ | Fechado em 2026-07-21 — fonte escolhida por medição, versão e hash pinados (ADR 0001) |
| **Empacotamento não executado** | Bun não está instalado nesta máquina; Node SEA não foi medido. A escolha do DESIGN era explicitamente "medir os dois" |

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

**Geral:** 🔄 IN PROGRESS

O núcleo funciona e está verificado contra o YouTube real, mas **não é entregável ainda**: sem
`.exe` e sem bootstrap do ffmpeg, o requisito "usuário baixa e roda" não se cumpre. Marcar ✅ aqui
seria confundir "o código funciona na minha máquina" com "o produto está pronto".

---

**Próximo passo:** empacotamento (`.exe` + medição do SC-6) e bootstrap do ffmpeg, antes do `/ship`.

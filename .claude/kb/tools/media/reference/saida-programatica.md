---
id: saida-programatica
layer: tools
domain: media
content_type: reference
status: active
related: [selecao-de-formato, taxonomia-de-erros]
source: context7
lib_id: /yt-dlp/yt-dlp
checked_at: 2026-07-20
---

# Saída programática do yt-dlp (canais estáveis para consumo por outro programa)

> Camada: `tools` · Domínio: `media`

Referência dos canais que o yt-dlp oferece **de propósito** para ser lido por outro
processo. Aplica-se diretamente a este projeto: o Node é o pai, o yt-dlp é subprocesso, e
tudo que a UI mostra (progresso, título, caminho final, erro) precisa vir daqui.

## A regra: nunca parsear o stdout humano

> "When calling yt-dlp from external programs, avoid parsing standard output as it may
> change between versions. Instead, utilize specific options like `-J`, `--print`,
> `--progress-template`, or `--exec` to generate reliable and reproducible console output
> for parsing." — README, seção *Embedding yt-dlp*

Isto é **contrato explícito do projeto**, não preferência de estilo. As linhas
`[youtube] Extracting URL: …`, `[download] 45.2% of 12.34MiB at 1.20MiB/s ETA 00:07` e
`[Merger] Merging formats into "…"` são **interface humana** e mudam entre releases sem
aviso. Como este projeto atualiza o yt-dlp em runtime (`SC-7`: sempre ≤ 7 dias da última
versão), um parser de stdout humano quebraria **silenciosamente e sem deploy** — a
atualização que deveria consertar o app é a que o quebra. Os quatro canais abaixo são o
que fica estável.

## Os quatro canais

| Canal | Flag | Quando | Formato |
|-------|------|--------|---------|
| Metadados completos | `-J` / `--dump-json` | antes do download | 1 objeto JSON por vídeo |
| Campo específico | `-O` / `--print` | em pontos nomeados do ciclo | texto, template seu |
| Progresso | `--progress-template` | durante o download | texto, template seu |
| Gancho externo | `--exec` | após etapas do ciclo | executa um comando |

## `-J` / `--dump-json` — o catálogo antes de baixar

> "'-j' / '--dump-json': Quiet, but print JSON information for each video. Simulate unless
> `--no-simulate` is used. See 'OUTPUT TEMPLATE' for a description of available keys"
> — `yt_dlp/options.py`

Dois pontos operacionais:

- **Simula por default.** `-J` sozinho **não baixa nada** — é a chamada barata para
  validar a URL e popular a UI. Para obter o JSON *e* baixar na mesma invocação, é preciso
  `--no-simulate`.
- **É "quiet".** A saída no stdout é o JSON, não o log — o que torna o parse direto.

Uso canônico neste projeto: **primeira chamada, antes de qualquer download**. Devolve
título, duração, uploader, thumbnail e o array `formats` — a base para montar o painel
avançado com as resoluções que **aquele** vídeo realmente tem, em vez de um menu fixo
(ver [`selecao-de-formato`](../patterns/selecao-de-formato.md)). Também é a forma mais
limpa de validar uma URL sem disparar download (`AT-005`).

Cuidado com o volume: o JSON de um vídeo do YouTube tem dezenas de formats e pode passar
de centenas de KB. Não é conteúdo para logar inteiro nem para trafegar cru até o browser.

**`-J` × `-j`:** `-j` (minúsculo) emite um objeto JSON **por linha** por vídeo (NDJSON);
`-J` agrega. Para uma URL única a diferença é irrelevante; num contexto de playlist ela
importa — mas playlists estão fora de escopo no v1 (`--no-playlist` é a postura correta
de qualquer forma, já que uma URL do YouTube pode carregar um `?list=` acidental).

## `-O` / `--print` — um campo, no momento certo

> "-O, --print [WHEN:]TEMPLATE: Field name or output template to print to screen,
> optionally prefixed with when to print it" — `options.py`

O prefixo `WHEN:` é o que torna esta flag útil e é a parte mais fácil de ignorar. Ele
ancora a impressão num **ponto do ciclo de vida**, e o `WHEN` padrão é `video`.

```bash
# imprime só o caminho final do arquivo, depois que todo o pós-processamento terminou
yt-dlp --print "after_move:filepath" URL
```

`after_move:filepath` é o canal correto para descobrir **onde o arquivo acabou** — o
requisito do `AT-001` ("UI mostra o caminho do arquivo"). Antes do `after_move` o caminho
pode ainda ser o temporário (`.part`, ou o nome pré-merge), porque:

- `--part` é **default `True`** — o yt-dlp escreve em `.part` e só renomeia ao fim;
- o merge de `bv+ba` produz arquivos intermediários que são apagados depois.

Deduzir o caminho final reimplementando o output template em TypeScript é duplicar lógica
que muda com o yt-dlp. Perguntar ao próprio yt-dlp via `after_move:filepath` é a rota
estável.

## `--progress-template` — progresso legível por máquina

> "--progress-template [TYPES:]TEMPLATE: Template for progress outputs, optionally
> prefixed with one of 'download:' (default), 'download-title:' (the console title),
> 'postprocess:', or 'postprocess-title:'. The video's fields are accessible under the
> 'info' key and the progress attributes are accessible under 'progress' key." — README

Dois namespaces: **`info.*`** (metadados do vídeo) e **`progress.*`** (estado do
download). Os campos de `progress.*` são exatamente os do dicionário de `progress_hooks`,
documentado no `YoutubeDL.py`:

```
* status: One of "downloading", "error", or "finished".
          Check this first and ignore unknown values.
* info_dict: The extracted info_dict

If status is one of "downloading", or "finished", the
following properties may also be present:
* filename: The final filename (always present)
* tmpfilename: The filename we're currently writing to
* downloaded_bytes: Bytes on disk
* total_bytes: Size of the whole file, None if unknown
* total_bytes_estimate: Guess of the eventual file size, None if unavailable.
* elapsed: The number of seconds since download started.
* eta: The estimated time in seconds, None if unknown
* speed: The download speed in bytes/second, None if unknown
* fragment_index: The counter of the currently downloaded video fragment.
* fragment_count: The number of fragments (= individual files that will be merged)
```

Duas instruções embutidas nesse docstring merecem virar código:

1. **"Check this first and ignore unknown values"** — o `status` é a chave; valores
   desconhecidos devem ser ignorados, não tratados como erro. Isso é o contrato de
   compatibilidade adiante: um `status` novo numa versão futura não deve quebrar a UI.
2. **`total_bytes` pode ser `None`.** No YouTube com DASH isso é o caso **comum**, não a
   borda — daí existir `total_bytes_estimate`. Uma barra de progresso que divide por
   `total_bytes` sem checar produz `NaN%` no caso mais frequente. Com fragmentos, o par
   `fragment_index`/`fragment_count` costuma ser um sinal de progresso mais confiável.

### Templates de progresso reais

Emitir **JSON por linha** é o que torna o parse no Node trivial — uma linha, um
`JSON.parse`, sem estado:

```bash
yt-dlp \
  --newline \
  --progress-template 'download:{"t":"progress","status":"%(progress.status)s","done":%(progress.downloaded_bytes)d,"total":%(progress.total_bytes_estimate)d,"speed":%(progress.speed)j,"eta":%(progress.eta)j}' \
  -f "bv*+ba/b" --merge-output-format mp4 URL
```

```bash
# progresso do pós-processamento (merge / conversão para mp3) é um TYPE separado
yt-dlp \
  --progress-template 'postprocess:{"t":"postprocess","status":"%(progress.status)s"}' \
  -x --audio-format mp3 URL
```

```bash
# exemplo do próprio README — título do console combinando os dois namespaces
yt-dlp --progress-template "download-title:%(info.id)s-%(progress.eta)s" URL
```

Notas sobre os conversores de template:

- `%(campo)j` serializa como **JSON**, o que produz `null` para valor ausente em vez de
  `NA` — é o que mantém a linha parseável quando `speed`/`eta` são desconhecidos.
- `%(campo)d` força inteiro; se o campo for `None`, o resultado depende do conversor —
  por isso `%(...)j` é a escolha mais segura para tudo que pode faltar.
- **`postprocess:` é um TYPE separado de `download:`.** Sem ele, a fase de merge/encode
  (que no `AT-002`, MP3, pode ser longa) fica **muda** — a barra congela em 100% e o
  usuário acha que travou. O `SC-2`/`SC-3` dependem de progresso visível o tempo todo.

`--newline` faz o yt-dlp emitir cada atualização numa linha nova em vez de reescrever a
linha atual com `\r` — sem isso, um leitor de linhas no Node pode acumular um buffer
enorme sem nunca ver um `\n`.

## `--exec` — gancho externo

> "--exec [WHEN:]CMD: Execute a command, optionally prefixed with when to execute it…
> The same syntax as the output template can be used to pass any field as arguments to
> the command" — README

Mesmo mecanismo de `WHEN` do `--print`. Útil quando a ação precisa acontecer **dentro**
do ciclo do yt-dlp (mover o arquivo, notificar) em vez de depois que o processo saiu.

Para este projeto é o canal **menos** indicado: o pai é um processo Node que já sabe
quando o filho terminou, e `--exec` acrescenta uma camada de quoting de shell — um
título de vídeo com aspas ou `&` vira injeção de comando. `--print after_move:filepath`
entrega a mesma informação sem shell no caminho.

## Padrão de invocação a partir do Node

Peças que se combinam:

| Flag | Por quê |
|------|---------|
| `--ignore-config` / `--no-config` | "Don't load any more configuration files" — impede que um `yt-dlp.conf` na máquina do usuário altere o comportamento do app. **Essencial** para reprodutibilidade num app distribuído |
| `--no-playlist` | "Download only the video, if the URL refers to a video and a playlist" — URL copiada do YouTube frequentemente carrega `&list=` |
| `--newline` | progresso em linhas discretas |
| `--progress-template download:…` + `postprocess:…` | progresso parseável nas duas fases |
| `--print after_move:filepath` | caminho final real |
| `--ffmpeg-location PATH` | aponta para o ffmpeg em cache do app, não para um do `PATH` do usuário |
| `-o` | template de saída controlado pelo app |

Sobre a execução do subprocesso: **não use shell**. `spawn` com array de argumentos
(`child_process.spawn(bin, args)`) evita que título/URL sejam interpretados pelo
interpretador de comandos — relevante porque a URL vem de input do usuário. E stdout e
stderr são canais distintos: o progresso e o JSON vão para stdout, diagnósticos e erros
vão para stderr (ver [`taxonomia-de-erros`](taxonomia-de-erros.md)).

Defaults do yt-dlp que já ajudam e não precisam ser reconfigurados (de `options.py`):
`--retries 10`, `--fragment-retries 10`, `--continue` (retoma downloads parciais, default
`True`), `--part` (default `True`). `-N`/`--concurrent-fragments` é `1` por default —
aumentá-lo acelera DASH/HLS, mas torna o progresso por fragmento não-monotônico.

## Não confirmado na doc consultada

- A lista completa dos valores válidos de `WHEN` (`pre_process`, `video`, `before_dl`,
  `post_process`, `after_move`, `playlist`) não foi obtida verbatim das fontes
  consultadas; `video` como default e `after_move` como ponto pós-movimentação estão
  confirmados. Rode `yt-dlp --help` da versão em uso para a lista autoritativa.

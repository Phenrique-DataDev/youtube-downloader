---
id: selecao-de-formato
layer: tools
domain: media
content_type: pattern
status: active
related: [saida-programatica, taxonomia-de-erros]
source: context7
lib_id: /yt-dlp/yt-dlp
checked_at: 2026-07-20
---

# Seleção de formato no yt-dlp

> Camada: `tools` · Domínio: `media`

Como o seletor `-f` é **resolvido contra o catálogo real** de um vídeo, e o que acontece
quando o formato pedido não existe. Este é o ponto onde o `AT-001` (MP4 melhor qualidade),
`AT-002` (MP3) e `AT-004` (720p) do DEFINE vivem ou morrem.

## O modelo mental: catálogo → filtro → ordenação → fallback

O yt-dlp **não** pede um formato ao YouTube; ele extrai um **catálogo** de formats
disponíveis para aquele vídeo específico e resolve o seletor **localmente** contra esse
catálogo. Consequência prática: o mesmo seletor pode render resultados diferentes em dois
vídeos, e um seletor "válido" pode não casar com nada.

A resolução tem quatro etapas:

1. **Filtro** — expressões entre colchetes (`[height<=720]`, `[vcodec~='^avc']`) descartam
   entradas do catálogo.
2. **Seleção** — `bv`/`bestvideo`, `ba`/`bestaudio`, `b`/`best`, `wv`/`worst` escolhem
   dentro do que sobrou.
3. **Combinação** — o operador `+` junta dois streams num arquivo só (**exige ffmpeg**).
4. **Fallback** — o operador `/` tenta a próxima alternativa se a anterior não casou.

## Os três operadores (não confundir)

| Operador | Significado | Efeito |
|----------|-------------|--------|
| `+` | merge | junta video-only + audio-only num arquivo. **Requer ffmpeg** |
| `/` | fallback | "tente A; se não houver, tente B". Só **um** resultado sai |
| `,` | múltiplos | baixa **todos** os que casarem — vários arquivos |

`,` é uma armadilha para este projeto: gera N arquivos, e sem um `-o` que os diferencie
por `%(format_id)s` eles colidem no mesmo nome. A doc explicita isso:

```bash
# Download the best video-only format and the best audio-only format without merging them
# For this case, an output template should be used since
# by default, bestvideo and bestaudio will have the same file name.
$ yt-dlp -f "bv,ba" -o "%(title)s.f%(format_id)s.%(ext)s"
```

## Vídeo: o seletor canônico e por que ele tem fallback

```bash
# doc oficial (README, FORMAT SELECTION)
yt-dlp -f "bv*+ba/b"
```

Leitura: *"melhor format que **contenha** vídeo, mesclado com o melhor áudio-only; se
isso não for possível, o melhor format combinado que já venha com áudio"*.

Três detalhes que mudam o comportamento:

- **`bv*` × `bv`** — `bv` é *video-only* estrito; `bv*` é "qualquer format que contenha
  um stream de vídeo", inclusive os já combinados. Com `bv*`, se o format escolhido já
  tiver áudio, o `+ba` é dispensado. É o mais tolerante — e o default do yt-dlp sem `-f`
  é equivalente a `bv*+ba/b`.
- **O `/b` final não é decorativo** — é ele que salva o caso em que o vídeo só oferece
  formats progressivos (áudio+vídeo juntos), sem streams separados. Sem o `/b`, o
  download falha em vez de degradar.
- **`+` exige ffmpeg.** Se o ffmpeg não estiver presente, o merge não acontece — ver
  [`taxonomia-de-erros`](../reference/taxonomia-de-erros.md).

### Container de saída

```bash
--merge-output-format mp4
```

> "Containers that may be used when merging formats, separated by '/', e.g. 'mp4/mkv'.
> Ignored if no merge is required" — README

Duas consequências para o `AT-001`:

- **É ignorado quando não há merge.** Se o seletor resolveu num format progressivo, o
  `--merge-output-format` não faz nada e a extensão sai como veio (pode ser `.webm`).
  Se o requisito é *"sempre `.mp4`"*, o container precisa ser garantido por
  pós-processamento (`--remux-video mp4`), não só por esta flag.
- **Codec × container.** O YouTube serve VP9/AV1 em muitos formats de alta resolução;
  empacotar isso em MP4 pode funcionar mas gerar arquivo que players do Windows não
  tocam. Para "reproduzível em qualquer lugar", filtrar por H.264 na origem é mais
  seguro que remuxar depois.

## Filtro por altura: `-f [height<=N]` × `-S height:N`

Há **dois mecanismos distintos** e a diferença importa para o `AT-004` (usuário pede 720p).

**Filtro rígido** — descarta o que não cabe:

```bash
# doc oficial
$ yt-dlp -f "bv*[height<=480]+ba/b[height<=480] / wv*+ba/w"
```

Note a cadeia de fallback dupla: se **nada** ≤480p existir, cai para `wv*+ba/w` (o pior
vídeo disponível). Sem esse segundo ramo, um vídeo que só existe em 1080p **falharia**.

**Ordenação por preferência** — nunca falha, só reordena:

```bash
# doc oficial
$ yt-dlp -S "height:480"
# "Download the best video available with the largest height but no better than 480p,
#  or the best video with the smallest resolution if there is no video under 480p"
```

| Abordagem | Se 720p não existe | Uso recomendado aqui |
|-----------|--------------------|-----------------------|
| `-f "bv*[height<=720]+ba/b"` | falha se não houver fallback explícito | quando o teto é **requisito duro** |
| `-S "height:720"` | degrada sozinho para o mais próximo | **preferível** para o painel avançado: o usuário escolhe uma preferência, não um contrato |

Existe ainda `-S "res:480"`, que ordena pela **menor dimensão** — a doc registra que isso
"works correctly for vertical videos as well". Vídeo vertical (Shorts) tem `height` grande
e `width` pequeno; filtrar por `height` num vertical dá resultado contraintuitivo.

## Filtro por codec

```bash
# doc oficial — h264 ou h265, com fallback para qualquer coisa
$ yt-dlp -f "(bv*[vcodec~='^((he|a)vc|h26[45])']+ba) / (bv*+ba/b)"

# equivalente por ordenação: melhor codec não superior a h264
$ yt-dlp -S "codec:h264"
```

O operador `~=` é match por **regex** contra o campo. O regex acima cobre as várias
grafias com que o mesmo codec aparece no catálogo (`avc1`, `h264`, `hevc`, `h265`) —
sinal de que os valores de `vcodec` **não são normalizados**; comparação por igualdade
exata (`[vcodec=h264]`) é frágil.

## Áudio: `-x` × filtro de format

Duas rotas com custos diferentes:

```bash
# rota 1 — extrair e converter (requer ffmpeg + ffprobe)
yt-dlp -x --audio-format mp3
```

> "-x, --extract-audio: Convert video files to audio-only files (requires ffmpeg and ffprobe)"
> "--audio-format FORMAT: … (currently supported: best (default), aac, alac, flac, m4a, mp3, opus, vorbis, wav)"
> "--audio-quality QUALITY: … a value between 0 (best) and 10 (worst) for VBR or a specific bitrate like 128K"

```bash
# rota 2 — o preset interno do próprio yt-dlp para mp3 (yt_dlp/options.py)
'mp3': ['-f', 'ba[acodec^=mp3]/ba/b', '-x', '--audio-format', 'mp3']
```

O preset combina as duas: tenta primeiro um format que **já seja** mp3
(`ba[acodec^=mp3]`) para evitar transcodificação, e só cai na conversão via `-x` se não
houver. Na prática o YouTube não serve mp3, então o ramo `/ba/b` + `-x` é o que roda —
mas o padrão vale: **filtrar pelo codec-alvo antes de transcodificar** economiza uma
passada de encode quando a fonte já está no formato certo.

`--audio-format best` (default) **não converte** — só extrai o stream de áudio como está
(tipicamente Opus/M4A no YouTube). É a opção mais rápida e sem perda de geração, mas não
entrega `.mp3`. Para o `AT-002`, `--audio-format mp3` é obrigatório e o custo do encode
com libmp3lame é inevitável.

## Quando o formato pedido não existe

Modos de degradação, do melhor ao pior:

| Situação | Resultado |
|----------|-----------|
| Seletor tem cadeia `/` que cobre o caso | degrada silenciosamente para a alternativa — **é o objetivo** |
| Seletor rígido sem fallback e nada casa | erro de "formato requisitado não disponível"; nada é baixado |
| `+` pedido mas ffmpeg ausente | o merge não acontece; ver [`taxonomia-de-erros`](../reference/taxonomia-de-erros.md) |
| `-S` usado no lugar de `-f` | nunca falha por indisponibilidade — só muda a ordem de preferência |

**Regra para este projeto:** todo seletor gerado pela UI deve terminar numa alternativa
que casa com qualquer catálogo (`/b`), ou usar `-S` para a preferência do usuário. Um
seletor sem rede de segurança transforma "vídeo com poucas resoluções" num erro que o
usuário não sabe interpretar — e o `AT-006` só cobre indisponibilidade do **vídeo**, não
do **format**.

Antes de montar o seletor, o catálogo real pode ser inspecionado com `-J` sem baixar nada
(campo `formats`) — ver [`saida-programatica`](../reference/saida-programatica.md). Isso
permite à UI oferecer só as resoluções que aquele vídeo realmente tem, em vez de um menu
fixo 1080p/720p/480p que pode não corresponder à realidade.

## Não confirmado na doc consultada

- A mensagem de erro exata quando nenhum format casa não foi localizada nas fontes
  consultadas (README e `options.py` via context7; busca no `YoutubeDL.py` não retornou o
  trecho). Detectar essa falha por **string** é frágil de qualquer forma — prefira
  validar o catálogo via `-J` antes de disparar o download.

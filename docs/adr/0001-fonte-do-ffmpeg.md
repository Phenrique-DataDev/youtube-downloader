# ADR 0001 — Fonte do ffmpeg no bootstrap

| | |
|---|---|
| **Data** | 2026-07-21 |
| **Status** | Aceita |
| **Contexto SDD** | Feature `DOWNLOADER_LOCAL`, pendência do [BUILD_REPORT](../../.claude/sdd/reports/BUILD_REPORT_DOWNLOADER_LOCAL.md) (AT-003, SC-8) |
| **Implementa** | [`src/bootstrap/ffmpeg.ts`](../../src/bootstrap/ffmpeg.ts) |

## Contexto

O app precisa de `ffmpeg.exe` e `ffprobe.exe` no cache para muxar vídeo e extrair áudio
(`-x` exige os dois). Até aqui eles eram colocados **à mão** — o que reprovava o AT-003
("usuário baixa e roda") e deixava SC-8 parcial.

Diferente do `yt-dlp`, que precisa se atualizar sozinho porque quebra quando o YouTube muda,
o ffmpeg é **pinado**: a interface que usamos é estável há anos, e trocar de versão na máquina
do usuário sem aviso só adiciona um modo de falha que ninguém pediu.

Restava escolher **de onde baixar**.

## Decisão

**Re-hospedar o pacote como asset de um GitHub Release nosso**, pinado por versão e por
SHA256 ancorado no código.

O arquivo é o `ffmpeg-8.0.1-essentials_build.zip` publicado pelo gyan.dev, **byte a byte** —
só mudou de endereço. O hash foi verificado contra o pacote original **antes** do upload.

## Alternativas medidas

Todas as três foram medidas em 2026-07-21, na mesma máquina e conexão. O gargalo acabou sendo
o **host**, não o tamanho do arquivo:

| Fonte | Tamanho | Throughput | 1ª execução | URL |
|-------|---------|-----------|-------------|-----|
| gyan.dev | 106 MB | 0,28 MB/s | **~10 min** (603 s, medido) | permanente |
| BtbN/FFmpeg-Builds | 167 MB | 25 MB/s | ~7 s | tag `autobuild-*`, **podada** |
| **Release nosso** | 106 MB | 25 MB/s | **~7 s** | **permanente** |

- **gyan.dev** foi a primeira escolha, justamente por ter arquivo versionado permanente. Foi
  implementada e verificada funcionando ponta a ponta — e então medida: 603 s. Dez minutos de
  primeira execução reprova o AT-003 na prática, por mais correto que o resto esteja.
- **BtbN** é rápido (CDN do GitHub) mas publica por tag `autobuild-<data>`, e essas tags são
  removidas com o tempo. Pinar ali significa que a primeira execução de **todo mundo** passa a
  dar 404 num dia futuro indeterminado — falha silenciosa, longe do commit que a causou.
- **Re-hospedar** herda o CDN do GitHub (rápido) e a URL é nossa (não apodrece). O projeto já
  publica o `.exe` por Release, então não é infraestrutura nova.

## Consequências

### Positivas

- Primeira execução cai de ~10 min para ~7 s.
- A URL é nossa: nenhum terceiro pode podá-la ou movê-la.
- O hash pinado no código continua sendo a âncora de confiança — inclusive **contra nós
  mesmos**: se o nosso Release for adulterado, a verificação acusa e o download é recusado.

### Negativas — e o que elas exigem

- **Obrigação de licença.** O build essentials é GPL. Redistribuir o binário nos obriga a
  acompanhar o pacote de licença e oferta do source correspondente. O Release
  `deps-ffmpeg-8.0.1` deve conter, além do zip:
  - `LICENSE-ffmpeg.txt` (GPL do build);
  - nota apontando o source correspondente (ffmpeg.org, versão 8.0.1) e o build original do
    gyan.dev.
- **Atualizar a versão vira trabalho manual.** Subir uma versão nova exige: baixar do upstream,
  conferir o hash, publicar novo Release e atualizar `PIN_PADRAO`. É deliberado — ver Contexto:
  pinning é o ponto, não um efeito colateral.
- **~106 MB no nosso Release.** Irrelevante frente ao limite de 2 GB por asset do GitHub.

## Notas de implementação

- O pin é **injetável** (`PinFfmpeg`), o que permite testar download → hash → extração → cache
  inteiro contra um servidor local, em milissegundos. Ver `tests/unit/ffmpeg.test.ts`.
- A extração usa o `tar.exe` (bsdtar) do próprio Windows, presente desde o Windows 10 1803, e
  extrai **apenas** os dois binários — o pacote traz `ffplay.exe`, `doc/` e `presets/` que
  nunca usamos.
- Todo o fluxo acontece num diretório temporário; o cache só é tocado depois que o hash confere
  **e** os dois binários foram encontrados. Um download cortado no meio nunca vira um
  `ffmpeg.exe` que o app executaria depois achando que está tudo bem.

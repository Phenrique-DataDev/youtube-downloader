# ADR 0001 — Fonte do ffmpeg no bootstrap

| | |
|---|---|
| **Data** | 2026-07-21 |
| **Status** | Aceita — com migração pendente (ver Consequências) |
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

**Baixar do BtbN/FFmpeg-Builds, com tag e SHA256 pinados no código** — e migrar para um
Release próprio quando o repositório for publicado.

Pin atual: `autobuild-2026-07-21-13-38` / `ffmpeg-n8.1.2-29-g703dcc25b9-win64-gpl-8.1.zip`,
SHA256 `ebf57e8b…be642` (baixado e verificado; confere com o `checksums.sha256` da release).

Re-hospedar num Release nosso era a escolha melhor — rápido **e** permanente — e chegou a ser
implementada. Esbarrou num fato: **o repositório é privado**, e asset de Release privado exige
token para baixar, enquanto o bootstrap faz `fetch` anônimo. A URL só passa a funcionar com o
repo público, o que é decisão de produto, não de implementação.

## Alternativas medidas

Todas as três foram medidas em 2026-07-21, na mesma máquina e conexão. O gargalo acabou sendo
o **host**, não o tamanho do arquivo:

| Fonte | Tamanho | Throughput | 1ª execução | URL | Viável hoje |
|-------|---------|-----------|-------------|-----|-------------|
| gyan.dev | 106 MB | 0,28 MB/s | **~10 min** (603 s, medido) | permanente | sim |
| **BtbN/FFmpeg-Builds** | 167 MB | 25 MB/s | **~2 s** (medido) | tag `autobuild-*`, **podada** | **sim — escolhida** |
| Release nosso | 106 MB | 25 MB/s | ~2 s | permanente | **não — repo privado** |

- **gyan.dev** foi a primeira escolha, justamente por ter arquivo versionado permanente. Foi
  implementada e verificada funcionando ponta a ponta — e então medida: 603 s. Dez minutos de
  primeira execução reprova o AT-003 na prática, por mais correto que o resto esteja. Esse é o
  ponto do episódio: a implementação estava certa e a **fonte** estava errada, e só a medição
  mostrou isso.
- **Re-hospedar** herda o CDN do GitHub e a URL é nossa. Bloqueada hoje pela visibilidade do
  repositório (ver Decisão), não por mérito — continua sendo o destino.
- **BtbN** é rápido (CDN do GitHub) e funciona anonimamente. O defeito é a tag `autobuild-<data>`,
  removida com o tempo: a primeira execução de **todo mundo** passaria a dar 404 num dia futuro
  indeterminado, longe do commit que a causou.

## Consequências

### Positivas

- Primeira execução cai de ~10 min para ~2 s.
- Nada é redistribuído por nós: **nenhuma obrigação de licença** recai sobre este projeto
  enquanto o download vier do upstream. (Ela volta quando migrarmos para Release próprio.)
- O hash pinado no código é a âncora de confiança: um asset trocado sob a URL é recusado.

### Negativas — e o que elas exigem

- **A URL vai apodrecer.** É dívida assumida, com data indeterminada. Mitigação: o workflow
  [`pin-ffmpeg.yml`](../../.github/workflows/pin-ffmpeg.yml) faz `HEAD` na URL **diariamente** e
  falha quando ela some — a descoberta vem do CI, não de um usuário relatando que o app não
  instala. Verificado: com uma tag inexistente, o guarda sai com código 1 e a mensagem diz o que
  fazer.
- **167 MB em vez de 106 MB.** Irrelevante a 25 MB/s; a 0,28 MB/s teria sido decisivo. O tamanho
  só importa em função do host.
- **Migração pendente.** Ao publicar o repositório: subir o pacote como asset nosso, atualizar
  `PIN_PADRAO` e reassumir a obrigação GPL (LICENSE + oferta de source no Release).

## Notas de implementação

- O pin é **injetável** (`PinFfmpeg`), o que permite testar download → hash → extração → cache
  inteiro contra um servidor local, em milissegundos. Ver `tests/unit/ffmpeg.test.ts`.
- A extração usa o `tar.exe` (bsdtar) do próprio Windows, presente desde o Windows 10 1803, e
  extrai **apenas** os dois binários — o pacote traz `ffplay.exe`, `doc/` e `presets/` que
  nunca usamos.
- Todo o fluxo acontece num diretório temporário; o cache só é tocado depois que o hash confere
  **e** os dois binários foram encontrados. Um download cortado no meio nunca vira um
  `ffmpeg.exe` que o app executaria depois achando que está tudo bem.

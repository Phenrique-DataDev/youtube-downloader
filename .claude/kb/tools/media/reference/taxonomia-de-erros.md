---
id: taxonomia-de-erros
layer: tools
domain: media
content_type: reference
status: active
related: [saida-programatica, selecao-de-formato, autoatualizacao-do-binario]
source: context7
lib_id: /yt-dlp/yt-dlp-wiki
checked_at: 2026-07-20
---

# Taxonomia de erros do yt-dlp — detectar e comunicar

> Camada: `tools` · Domínio: `media`

Modos de falha, como **distingui-los programaticamente** e o que dizer ao usuário. Cobre
`AT-005` a `AT-008` do DEFINE e sustenta o `SC-5` (100% dos modos de falha viram mensagem
acionável em pt-BR, 0 stack traces na UI).

> **Escopo — decisão registrada no DEFINE.** Esta entrada documenta **detecção e
> comunicação**, nunca contorno. Burlar detecção de bot (proxy residencial, cookies de
> conta de terceiro, spoof de cliente) está explicitamente *Out of Scope*. Onde a doc
> oficial sugere workarounds nessa direção, isto está registrado abaixo como **fora de
> escopo**, de propósito — não como lacuna a preencher depois.

## O problema central: o canal de erro é frágil

Ao contrário do progresso, que tem `--progress-template` (canal estável — ver
[`saida-programatica`](saida-programatica.md)), **as mensagens de erro não têm um canal
estruturado equivalente**. Elas chegam como texto em stderr, e o texto é gerado por
extrator (o extrator do YouTube tem as suas, o do Instagram as dele). Isso significa:

- **Classificar por substring é inerentemente frágil** e quebra em atualização do yt-dlp —
  o que este projeto faz automaticamente (ver
  [`autoatualizacao-do-binario`](autoatualizacao-do-binario.md)). O risco é real, não
  teórico.
- A estratégia correta é **em camadas**: eliminar o que dá para eliminar **antes** de
  invocar o yt-dlp, e tratar a classificação por texto como *best effort* com um fallback
  genérico que nunca vaza detalhe técnico.

### As três camadas de defesa

| Camada | Onde roda | Cobre |
|--------|-----------|-------|
| 1. Pré-voo local | Node, antes de qualquer subprocesso | URL inválida (`AT-005`), ffmpeg/yt-dlp ausentes |
| 2. Sonda barata | `yt-dlp -J` (simula, não baixa) | vídeo indisponível (`AT-006`), sem rede (`AT-007`), anti-bot (`AT-008`) |
| 3. Classificação do erro real | stderr do subprocesso | o que escapou das camadas 1 e 2 |

A camada 2 é o ganho de arquitetura: `-J` **simula por default** — falha barato, rápido e
antes de qualquer byte de mídia. Quase todos os modos de falha aparecem ali, com o app
ainda em estado limpo. Descobrir "vídeo privado" aos 80% de um download é pior UX e
desperdício de banda.

## Sinal de saída: exit code

O yt-dlp sinaliza falha pelo **exit code** do processo. No `YoutubeDL.py`, o método
`trouble()` faz `self._download_retcode = 1` quando `ignoreerrors` não está habilitado —
ou seja, **exit code diferente de 0 é o sinal binário confiável de "algo deu errado"**.

O que ele **não** dá é a categoria: o código não distingui "vídeo privado" de "sem rede".
Portanto o desenho correto é:

- **exit code** → decide *se* falhou (confiável, estável);
- **stderr** → tenta decidir *o que* falhou (frágil, best effort);
- **fallback genérico** → quando o stderr não casa com nada conhecido.

**Não** habilite `-i`/`--ignore-errors` neste app. A doc é explícita: *"Ignore download
and postprocessing errors. The download will be considered successful even if the
postprocessing fails"*. Para o `AT-002` isso é desastroso — a conversão para MP3 falhar e
o processo sair com 0 faria a UI anunciar sucesso sem arquivo MP3 em disco.

## Catálogo de falhas

### AT-005 — URL inválida

**Detectar:** na **camada 1**, sem tocar no yt-dlp. O `AT-005` exige que "nenhum processo
seja disparado" — isso é um requisito de arquitetura, não de tratamento de erro: a
validação tem que preceder o `spawn`.

Valide o formato de URL do YouTube (host `youtube.com`/`youtu.be`/`m.youtube.com`,
presença de video id). Distinga dois casos na mensagem: *não é URL nenhuma* × *é uma URL,
mas não do YouTube*.

**Comunicar:** explicar o formato esperado, com exemplo concreto
(`https://www.youtube.com/watch?v=...`). O DEFINE pede a recusa **antes** de tentar
baixar.

Uma URL sintaticamente válida cujo vídeo não existe **não** é este caso — é o `AT-006`, e
só a camada 2 detecta.

### AT-006 — vídeo privado / removido / restrito por região

**Detectar:** camada 2. `yt-dlp -J URL` falha e o stderr traz a razão do extrator. O
`AT-006` exige informar **qual** das três causas ocorreu, o que obriga a distinguir por
texto. Palavras-chave observáveis (verificar contra a versão em uso — **não** foram
obtidas verbatim da doc consultada):

| Causa | Sinal aproximado no stderr |
|-------|-----------------------------|
| Privado | menção a *private* |
| Removido / inexistente | menção a *unavailable*, *removed*, *does not exist* |
| Geo-restrito | menção a *not available in your country*, *geo* |
| Requer login | o yt-dlp emite um "login hint" (`raise_login_required` no código dos extratores) |

**Estratégia mais robusta que grep no stderr:** quando o `-J` **funciona parcialmente**,
o próprio JSON traz campos que classificam sem parse de texto — notadamente
`availability` (valores como `private`, `unlisted`, `public`, `subscriber_only`) e
`live_status`. Prefira o campo estruturado; caia no texto só quando o `-J` falhou
inteiro.

**Comunicar:** uma frase por causa, sem jargão. "Este vídeo é privado", "Este vídeo foi
removido", "Este vídeo não está disponível no seu país". O DEFINE exige que o app siga
utilizável — a falha é do vídeo, não do app.

**Casos vizinhos** que o usuário-alvo não distingue de "indisponível" e merecem mensagem
própria se detectáveis: vídeo com restrição etária, live ainda não iniciada
(`live_status: is_upcoming`), vídeo exclusivo para membros.

### AT-007 — sem rede

**Detectar:** camada 2, mas **não** confie só no stderr do yt-dlp — a distinção entre
"sem rede" e "YouTube fora do ar" e "DNS quebrado" produz mensagens diferentes de
extrator. Faça uma checagem de conectividade no **Node** antes de classificar: se a
resolução de DNS ou uma requisição HTTP básica falha, é ausência de conectividade,
independentemente do que o yt-dlp disse.

Atenção ao tempo: `--retries 10` e `--fragment-retries 10` são **default**. Sem rede, o
yt-dlp pode levar bastante tempo tentando antes de desistir, e a UI fica parada. Para a
sonda `-J` inicial vale reduzir (`--retries 1`) e impor um timeout no Node — a sonda deve
falhar **rápido**; o download real é que merece a persistência dos retries.

**Comunicar:** informar a ausência de conexão e sugerir nova tentativa. O DEFINE é
explícito: "app não trava nem fecha" — o timeout precisa devolver o controle à UI, não
deixar o botão em estado de carregamento indefinido.

### AT-008 — verificação anti-bot

**Detectar:** camada 2. O wiki oficial (`Extractors.md`) descreve o mecanismo:

> "YouTube is gradually enforcing the use of a 'PO Token' to be able to download videos."
> "By default, yt-dlp will attempt to download videos using clients that do not currently
> require a PO Token."

Sinais desta família:
- mensagem pedindo confirmação de que não é um bot / exigindo sign-in;
- HTTP 429 (*Too Many Requests*) ou 402 — o wiki (`FAQ.md`) descreve ambos como bloqueio
  de IP por excesso de uso, tipicamente **soft block**;
- *"This content isn't available, try again later"*, que o wiki atribui a excesso do
  **rate limit** de requisições, não a indisponibilidade do vídeo. O wiki quantifica:
  ~300 vídeos/hora para sessão guest, ~2000/hora para conta autenticada, e recomenda
  "a delay of around 5-10 seconds between downloads".

Essa última é a mais traiçoeira: o texto **soa** como `AT-006` (indisponível) mas é
`AT-008` (bloqueio). Classificá-la como "vídeo indisponível" faria o usuário concluir que
o vídeo sumiu quando basta esperar.

**Comunicar:** explicar que o YouTube bloqueou a requisição e sugerir tentar mais tarde —
literalmente o que o `AT-008` pede. Diferenciar de `AT-006` é o valor: "o vídeo está lá,
o YouTube só não nos atendeu agora".

**Fora de escopo (decisão do DEFINE, não lacuna):**

| O que a doc sugere | Por que não fazemos |
|--------------------|---------------------|
| Passar cookies do browser / de conta | *Out of Scope*: cookies de conta de terceiro |
| `--user-agent` customizado, troca de client (`mweb` + PO Token) | *Out of Scope*: spoof de cliente |
| `--source-address` / proxy | *Out of Scope*: proxy residencial |
| Resolver CAPTCHA no browser e repassar sessão | Mesma família — exige a conta do usuário |

O que **é** legítimo e vale considerar: o `sleep` entre downloads recomendado pelo wiki é
**redução voluntária de taxa**, não contorno de detecção — reduz a chance de esbarrar no
limite em vez de disfarçar quem está pedindo. Com downloads individuais disparados
manualmente por uma pessoa (o caso deste app), o limite raramente é alcançado.

Registre-se: o `A-005` do DEFINE assume que rodar do IP residencial evita a detecção "na
maioria dos usos". Se `AT-008` virar frequente, é o produto que precisa de decisão nova —
não este documento.

### ffmpeg ausente

**Detectar:** camada 1 — **verificação de presença**, nunca por mensagem de erro. Esta
falha é 100% previsível e não deveria jamais chegar ao usuário.

A doc classifica ffmpeg como *"Strongly recommended"* e adverte: *"Users should install
the FFmpeg binary rather than the Python package of the same name"*. `-x` é documentado
como *"requires ffmpeg and ffprobe"* — note o **e**: `ffprobe` é binário separado e
precisa estar presente também.

Sem ffmpeg, o que quebra:
- `+` (merge de `bv*+ba`) — o download de vídeo de alta qualidade;
- `-x --audio-format mp3` — o `AT-002` inteiro;
- `--merge-output-format` e remux.

Sem ffmpeg **ainda funciona** o download de um format progressivo único (`-f b`), em
qualidade tipicamente inferior. Isso é um caminho de degradação viável, não um substituto.

**Comunicar / prevenir:** o `AT-003` (primeira execução) e o `SC-4` (zero dependências
manuais) já exigem que o app baixe ffmpeg no primeiro uso. Portanto o tratamento correto
é **checar antes** — presença do binário no cache + `ffmpeg -version` executando — e, se
faltar, disparar a preparação de dependências com progresso, não emitir erro. Sempre passe
`--ffmpeg-location` apontando para o binário em cache do app: sem isso o yt-dlp procura no
`PATH` e pode achar um ffmpeg antigo do usuário, cujo comportamento é desconhecido.

**Erro relacionado, quando o ffmpeg existe mas é velho:** o FAQ documenta *"incorrect
codec parameters"* / *"Could not write header"* / *"Invalid argument"* com versões antigas
de ffmpeg lidando com áudio Opus em containers mp4/webm — cenário plausível no YouTube, que
serve Opus. O workaround oficial é `--postprocessor-args "ffmpeg:-strict -2"`, mas a
recomendação primária da doc é **atualizar o ffmpeg**. Como este app controla a versão que
baixa, prevenir isso é responsabilidade do bootstrap, não do runtime.

### yt-dlp ausente ou corrompido

**Detectar:** camada 1, mesmo padrão do ffmpeg. Cobre a primeira execução (`AT-003`) e o
caso de cache corrompido. Ver [`autoatualizacao-do-binario`](autoatualizacao-do-binario.md)
— o bootstrap inicial **não** é responsabilidade do updater embutido.

### Formato requisitado indisponível

**Detectar:** melhor **evitar** que detectar. Um seletor com cadeia de fallback (`/b`) ou
o uso de `-S` em vez de `-f` torna esta falha impossível — ver
[`selecao-de-formato`](../patterns/selecao-de-formato.md). Se ainda assim ocorrer, a
sonda `-J` já trouxe o array `formats`: dá para saber que o pedido não casaria **antes**
de baixar.

**Comunicar:** nunca como "formato indisponível" (o usuário não pediu formato, pediu
"720p"). "Este vídeo não está disponível em 720p — a melhor qualidade é X" é a mensagem
que o `-J` permite construir.

## Postura de comunicação (SC-5)

| Não faça | Faça |
|----------|------|
| Repassar o stderr do yt-dlp para a UI | Mapear para uma mensagem própria em pt-BR |
| Mostrar stack trace do Node | Logar em arquivo; na UI, só a mensagem |
| "Erro desconhecido (código 1)" | "Não foi possível baixar este vídeo. Tente novamente em alguns minutos." + detalhe técnico atrás de um "ver detalhes" |
| Deixar a UI travada no estado de carregamento | Todo caminho de erro devolve a UI ao estado utilizável (exigência de `AT-006` e `AT-007`) |

**O fallback genérico é obrigatório, não opcional.** A classificação por texto vai falhar
em algum momento — depois de alguma atualização do yt-dlp, alguma mensagem nova não vai
casar com nenhum padrão. O caminho não-classificado precisa produzir mensagem acionável e
manter o app usável. Guardar o stderr bruto em log local (não na UI) é o que torna esse
caso diagnosticável depois.

## Não confirmado na doc consultada

- **As strings de erro exatas** do extrator do YouTube (vídeo privado, removido,
  geo-restrito, anti-bot) não foram obtidas verbatim das fontes consultadas. As
  palavras-chave listadas são orientação, não contrato — valide contra a versão do yt-dlp
  em uso, e prefira campos estruturados do `-J` (`availability`, `live_status`) sempre que
  disponíveis.
- **A tabela oficial de exit codes** do yt-dlp não foi localizada na doc consultada; o
  README documenta o comportamento de erro (`--ignore-errors`, `--abort-on-error`) mas não
  enumera códigos. O que está confirmado no código-fonte é `_download_retcode = 1` em
  `trouble()`. Trate "≠ 0 é falha" como o contrato, e não atribua significado a códigos
  específicos.

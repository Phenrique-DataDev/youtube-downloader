---
id: autoatualizacao-do-binario
layer: tools
domain: media
content_type: reference
status: active
related: [taxonomia-de-erros, saida-programatica]
source: context7
lib_id: /yt-dlp/yt-dlp
checked_at: 2026-07-20
---

# Autoatualização do binário do yt-dlp

> Camada: `tools` · Domínio: `media`

Como o updater embutido do yt-dlp funciona, o que ele garante, e — o mais importante para
este projeto — **o que ele não faz**. Sustenta o `SC-7` (yt-dlp ≤ 7 dias da última versão,
sem ação do usuário) e o `AT-010`.

## Por que isto é requisito e não conveniência

O `project-context.md` registra a fragilidade do yt-dlp como risco transversal: ele quebra
com frequência quando o YouTube muda. Um executável distribuído por GitHub Release
carrega o yt-dlp que existia no dia do build; sem atualização em runtime, o app apodrece
sozinho na máquina do usuário e a única saída seria republicar o executável a cada quebra.
O DEFINE também exclui auto-update do próprio executável do escopo — **só o yt-dlp se
atualiza**. Isso torna o updater embutido a única peça que mantém o app vivo.

## As flags

```bash
yt-dlp -U                          # atualiza dentro do canal atual
yt-dlp --update-to master
yt-dlp --update-to nightly
yt-dlp --update-to stable@2023.07.06
yt-dlp --update-to 2023.10.07
yt-dlp --update-to example/yt-dlp@2023.09.24    # fork/repo alternativo
```

`--update-to` aceita **canal**, **versão**, `canal@versão` e `repo@versão`. Aceitar versão
específica significa que **downgrade é suportado** — relevante como plano de contingência:
se uma versão nova quebrar em produção, dá para pinar a anterior sem republicar o `.exe`.

## Canais

> "There are currently three release channels for binaries: `stable`, `nightly` and
> `master`" — README

| Canal | Perfil |
|-------|--------|
| `stable` | releases marcados |
| `nightly` | build diário; o README o descreve como **"the recommended channel for regular users"** |
| `master` | topo do desenvolvimento |

O README recomendar `nightly` para usuários regulares é contraintuitivo e é consequência
direta da natureza do problema: quando o YouTube muda algo, a correção sai no nightly bem
antes de virar release estável. Para este projeto, cuja utilidade inteira depende de
acompanhar mudanças do YouTube, `nightly` é o default defensável. Mas note o trade-off que
o `SC-7` não menciona: nightly também é o canal com maior chance de introduzir uma
regressão — daí o downgrade por versão específica valer como contingência.

## O mecanismo interno (`yt_dlp/update.py`)

Entender isto decide o que delegar ao updater e o que fazer no Node.

### Verificação por SHA2-256SUMS

O updater baixa o asset `SHA2-256SUMS` da release no GitHub e procura a linha
correspondente ao nome do binário atual:

```python
checksum = None
# Non-updateable variants can get update_info but need to skip checksum
if not is_non_updateable():
    try:
        hashes = self._download_asset('SHA2-256SUMS', result_tag)
    except network_exceptions as error:
        if not isinstance(error, HTTPError) or error.status != 404:
            self._report_network_error(f'fetch checksums: {error}')
            return None
        self.ydl.report_warning('No hash information found for the release, skipping verification')
    else:
        for ln in hashes.decode().splitlines():
            if ln.endswith(_get_binary_name()):
                checksum = ln.split()[0]
                break
        if not checksum:
            self.ydl.report_warning('The hash could not be found in the checksum file, skipping verification')
```

Dois pontos de atenção operacional:

- A ausência do arquivo (404) ou da linha do binário **não aborta** — emite um *warning* e
  segue com `checksum = None`. A verificação degrada em vez de bloquear.
- O checksum é buscado por **sufixo do nome do binário**. Se o app renomear o executável
  do yt-dlp no cache (`yt-dlp-cached.exe`, por exemplo), a linha não casa e a verificação
  é silenciosamente pulada. **Preserve o nome original do binário.**

### Substituição atômica e bloqueio de restart

```python
if not update_info.checksum:
    self._block_restart('Automatically restarting into unverified builds is disabled for security reasons')
elif hashlib.sha256(newcontent).hexdigest() != update_info.checksum:
    return self._report_network_error('verify the new executable', tag=update_info.tag)

try:
    with open(new_filename, 'wb') as outf:
        outf.write(newcontent)
except OSError:
    return self._report_permission_error(new_filename)

if old_filename:
    mask = os.stat(self.filename).st_mode
    try:
        os.rename(self.filename, old_filename)
    except OSError:
        return self._report_error('Unable to move current version')

    try:
        os.rename(new_filename, self.filename)
    except OSError:
        self._report_error('Unable to overwrite current version')
        return os.rename(old_filename, self.filename)
```

O protocolo, em ordem: escreve o conteúdo novo em **`.new`** → renomeia o binário atual
para **`.old`** → renomeia `.new` para o nome real. Renomear no mesmo volume é atômico no
sistema de arquivos; o original permanece íntegro até o novo estar completamente escrito e
verificado. Falha no segundo rename → restaura o `.old` de volta.

**A garantia é "nunca fica sem binário"**, não "a atualização sempre funciona". O caminho
de falha deixa o binário anterior funcionando — que é exatamente o que o `AT-010` pede ao
exigir que a atualização não impeça o uso.

**O bloqueio de restart** (`_block_restart`) é o comportamento mais fácil de interpretar
mal: quando **não há checksum**, o binário novo é baixado e instalado, mas o yt-dlp se
recusa a **reiniciar automaticamente dentro dele** — *"Automatically restarting into
unverified builds is disabled for security reasons"*. Consequência: numa atualização sem
checksum, o processo atual continua rodando a versão **antiga**; a nova só entra em vigor
na próxima invocação. Como este projeto invoca o yt-dlp como subprocesso novo a cada
download, isso é benigno — mas explica por que uma atualização "bem-sucedida" pode não
mudar o comportamento imediatamente.

### Assinatura GPG

A release também publica `SHA2-256SUMS.sig`, verificável contra a chave pública do
projeto:

```bash
curl -L https://github.com/yt-dlp/yt-dlp/raw/master/public.key | gpg --import
gpg --verify SHA2-256SUMS.sig SHA2-256SUMS
gpg --verify SHA2-512SUMS.sig SHA2-512SUMS
```

Isto é **fora** do updater embutido — é verificação manual. O updater confere o hash
contra o `SHA2-256SUMS` (integridade), mas não valida a **assinatura** desse arquivo
(autenticidade). Exigiria gpg na máquina do usuário, o que colide com o `SC-4` (zero
dependências manuais). Registrado como limitação conhecida, não como pendência.

## O que NÃO delegar ao updater

Esta é a parte que muda o desenho do app.

### 1. Bootstrap inicial — não existe binário para se atualizar

`-U` atualiza **o binário que está executando**. No primeiro uso (`AT-003`, máquina limpa)
não há binário nenhum: não há o que executar, e portanto não há o que atualizar. O
download inicial é **responsabilidade do app**, não do yt-dlp.

O bootstrap precisa fazer, no Node, o que o updater faz internamente:

| Etapa | Por quê |
|-------|---------|
| Baixar o binário da release do GitHub | não há alternativa — é o passo zero |
| Baixar e conferir o `SHA2-256SUMS` correspondente | mesma garantia de integridade que o updater dá depois; pular isso deixa o único momento sem verificação ser justamente o primeiro |
| Escrever em temporário e renomear | evita cache corrompido se o app for fechado no meio (`AT-003` roda numa conexão real, que cai) |
| Preservar o nome original do binário | senão a verificação de checksum das atualizações futuras é pulada em silêncio |
| Reportar progresso | `SC-2`: ≤ 3 min com progresso visível o tempo todo |

### 2. ffmpeg — não tem updater embutido

**O ffmpeg não possui mecanismo de auto-update.** `-U` atualiza o yt-dlp e **só** o
yt-dlp. Todo o ciclo de vida do ffmpeg (baixar, verificar, versionar, atualizar) é do app.

Isto contradiz a leitura ingênua do `SC-7` ("dependência sempre atualizada"): o `SC-7` fala
do yt-dlp, e é o único que o updater cobre. O ffmpeg envelhece no cache do usuário até
alguém decidir trocá-lo — e o FAQ documenta erros reais causados por ffmpeg antigo
(*"incorrect codec parameters"* com áudio Opus, ver
[`taxonomia-de-erros`](taxonomia-de-erros.md)). O `A-001` do DEFINE já antecipa isso: "o
ffmpeg envelhece junto".

Consequência prática: **duas estratégias de atualização diferentes no mesmo app**, e não
uma. yt-dlp = frequente, delegado ao updater. ffmpeg = raro, do app, provavelmente pinado
numa versão testada e trocado só quando o app for atualizado.

### 3. A decisão de *quando* atualizar

O `AT-010` exige que a atualização aconteça "sem intervenção e sem impedir o uso", e o
`SC-1` exige UI visível em ≤ 5 s. Um `-U` **síncrono e bloqueante** no start viola o
`SC-1`: envolve requisição à API do GitHub, download do binário e do checksum.

O desenho compatível com ambos: subir a UI imediatamente, disparar a checagem de
atualização **em paralelo**, e nunca deixar a falha dela bloquear um download. Se a
atualização falhar (sem rede, GitHub fora, permissão negada), o binário anterior continua
funcionando — a garantia do `.old`. O usuário não precisa saber que houve tentativa.

Sobre a cadência: rodar `-U` a cada execução gasta requisições à API do GitHub, que tem
rate limit para chamadas não-autenticadas. Guardar um timestamp da última checagem e
respeitar uma janela (o `SC-7` dá folga de 7 dias) é mais barato e cumpre o critério com
margem.

### 4. Permissão de escrita

`_report_permission_error` existe porque este caso é comum. Em Windows, um binário dentro
de `Program Files` não é gravável sem elevação, e o próprio arquivo em execução pode estar
bloqueado. O cache precisa ficar num diretório gravável pelo usuário (`%LOCALAPPDATA%`) —
decisão do app, e o updater não a toma por você.

## Resumo de responsabilidades

| Responsabilidade | Quem |
|------------------|------|
| Atualizar o yt-dlp existente | updater embutido (`-U`) |
| Verificar SHA-256 na atualização | updater embutido (degrada com warning se ausente) |
| Substituição atômica `.new`/`.old` | updater embutido |
| **Baixar o yt-dlp na 1ª execução** | **o app** |
| **Verificar checksum no bootstrap** | **o app** |
| **Todo o ciclo de vida do ffmpeg** | **o app** |
| **Decidir quando/com que frequência atualizar** | **o app** |
| **Escolher um diretório gravável** | **o app** |
| Verificar assinatura GPG | ninguém, neste desenho (limitação registrada) |

## Não confirmado na doc consultada

- **Se o binário do yt-dlp para Windows (`yt-dlp.exe`) é "updateable" por default** — o
  código verifica `is_non_updateable()`, e instalações via gerenciador de pacotes (pip,
  distro) são não-atualizáveis por design. O caso "binário baixado da release do GitHub"
  é o cenário para o qual o updater existe, mas a lista exata de variantes bloqueadas não
  foi obtida da doc consultada. **Verifique isto empiricamente no BUILD** — se o binário
  distribuído for não-atualizável, o `SC-7` inteiro depende do app implementar a
  atualização, não só o bootstrap.
- **Se o `.old` é removido** após uma atualização bem-sucedida, ou fica no disco. O
  trecho consultado não cobre a limpeza.

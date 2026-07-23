# DEFINE: Ciclo de vida do app

> O app passa a ter um começo, um meio e um fim explícitos: uma única instância por vez, sem
> janela de console, e um jeito visível de encerrar.

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | CICLO_DE_VIDA |
| **Data** | 2026-07-21 |
| **Status** | Pronto para Design |
| **Clarity Score** | 14/15 |
| **Revisão** | 2026-07-21 — público-alvo esclarecido (grupo pequeno, não-técnico) e fluxo de **link salvo** incorporado. Ver *O que a revisão mudou* |

---

## O que a revisão mudou

A 1ª versão deste DEFINE assumia que a pessoa **executa o `.exe`** toda vez que quer usar. O
objetivo real é outro: depois da primeira execução, ela **abre um link salvo nos favoritos** e usa
normalmente, sem nada aparecendo na tela.

Isso quebrou uma premissa do código atual e um dos meus próprios Acceptance Tests:

| O que estava | Por que caiu |
|--------------|--------------|
| O token de sessão é gerado a cada execução (`http.ts:47`) e vai na URL (`http.ts:72`) | Um favorito guarda o token da execução que o criou. Na vez seguinte ele **sempre** falha — o link salvo nunca funcionaria |
| **AT-101**: a 2ª execução abre uma aba nova apontando para a instância existente | Contradiz "sem abas aparecendo". A 2ª execução deve ficar **quieta** |

A correção entregue em `b2551d9` (token expirado vira mensagem legível) tratou o sintoma achando
que a expiração era o comportamento desejado. Ela continua correta como **rede de segurança** —
mas deixa de ser o caminho feliz, porque no caminho feliz o link não expira.

---

## Por que não se chama `INSTANCIA_UNICA`

A fase foi aberta com "instância única", mas as três decisões tomadas no início do DEFINE são
**mutuamente dependentes** e não sobrevivem separadas:

- Esconder o console **exige** instância única — sem ela, cada execução deixa um servidor
  invisível, e o usuário perde até o sintoma (a janela) que hoje denuncia o problema.
- Esconder o console **exige** o botão Encerrar — sem ele, fechar o app passa a depender do
  Gerenciador de Tarefas.
- O botão Encerrar sozinho não resolve nada se cada execução subir um servidor novo.

Entregar só "instância única" deixaria o problema pela metade, e entregar só o "esconder console"
seria ativamente pior que o estado atual. Por isso o artefato cobre o ciclo inteiro: **como o app
começa, como ele se mantém e como ele termina**.

## Problema

O app não tem encerramento discoverable nem controle de instância: executá-lo duas vezes sobe dois
servidores e abre duas abas (`main.ts:154` chama `abrirNoBrowser` incondicionalmente; `http.ts:91`
cai para porta aleatória no `EADDRINUSE`), e a única forma de encerrá-lo é fechar uma janela preta
de console que nada explica. Quem fecha só a aba do navegador deixa um servidor rodando —
silenciosamente, até o reboot.

## Usuários-alvo

Grupo **pequeno e conhecido**, com pouca ou nenhuma experiência em programação. Ninguém aqui vai
ler log, abrir Gerenciador de Tarefas ou diagnosticar um link quebrado.

| Usuário | Papel | Dor |
|---------|-------|-----|
| Pessoa não-técnica que recebeu o `.exe` | usuário final | Não sabe que a janela preta é o app; fecha a aba achando que encerrou. Na próxima execução ganha outra aba e não entende por quê |
| A mesma pessoa, na 2ª semana | usuário recorrente | Salvou o link nos favoritos como faria com qualquer site. Ele não funciona mais, e ela não tem como saber por quê |
| A mesma pessoa, dias depois | usuário recorrente | Acumulou processos que ela não sabe que existem, não sabe como matar, e que seguram a porta |

## Goals (priorizados)

| Prioridade | Goal |
|------------|------|
| **MUST** | O endereço da UI é **estável entre execuções**: um link salvo nos favoritos continua funcionando nas vezes seguintes, sem passo extra |
| **MUST** | Uma execução com o app já rodando **não** sobe um segundo servidor e **não** abre aba nenhuma: encerra a si mesma em silêncio |
| **MUST** | A UI oferece um controle explícito de **Encerrar** que desliga o servidor e o processo |
| **MUST** | Uma instância anterior que morreu (crash, kill) **não** pode impedir uma execução nova |
| **MUST** | Falha de arranque continua **visível** para o usuário — esconder o console não pode transformar erro em silêncio |
| **SHOULD** | A janela de console não fica visível durante o uso normal |
| **SHOULD** | A UI oferece **iniciar com o Windows** (desligado por padrão); com ele ligado, o app sobe silencioso e o favorito sempre funciona |
| **COULD** | A landing e o README descrevem o ciclo (abrir, usar, encerrar) e ensinam a salvar o link |

### Quando o app abre o navegador

Decidido em 2026-07-21. A regra existe porque "abrir aba" deixou de ser um detalhe de arranque e
virou o principal vetor de "coisas aparecendo":

| Situação | Abre aba? |
|----------|-----------|
| Subiu porque a pessoa executou o atalho | **Sim** — ela quer usar agora |
| Subiu sozinho no login do Windows (autostart ligado) | **Não** — ninguém pediu nada |
| Execução com o app já rodando, **modo silencioso** (autostart) | **Não** — ninguém pediu nada |
| Execução com o app já rodando, **pelo atalho** | **Sim** — ver emenda de 2026-07-22 |

> **Emenda 2026-07-22.** A linha original dizia que qualquer execução com o app já rodando "encerra
> em silêncio", sem abrir aba. O build da leva 1 divergiu de propósito e a divergência ficou
> registrada no `BUILD_REPORT`: clicar no atalho **é** o gesto de "quero ver o app agora", e não abrir
> nada deixaria a pessoa clicando num ícone que não responde — o pior silêncio possível para este
> público. O que a regra original protegia (não aparecer nada sem ser pedido) continua valendo
> integralmente no caminho do autostart, que é onde ninguém pediu nada.

## Success Criteria (mensuráveis)

- [ ] O mesmo link abre a UI funcionando em **3** execuções consecutivas do app, com o navegador
      fechado entre elas — **0** passos manuais do usuário entre uma e outra
- [ ] Após **5** execuções consecutivas do `.exe`, existe exatamente **1** processo do app vivo e
      **0** abas foram abertas pelas execuções 2 a 5 **em modo silencioso** (autostart). Pelo atalho,
      abrir a aba é o comportamento esperado — ver a emenda de 2026-07-22 acima
- [ ] Após clicar Encerrar, **0** processos do app e **0** processos filhos (`yt-dlp`/`ffmpeg`)
      permanecem, e a porta `47821` volta a aceitar bind em **< 2 s**
- [ ] A detecção de instância existente conclui em **< 500 ms** — não pode atrasar perceptivelmente
      o arranque do caso comum (nenhuma instância rodando)
- [ ] A janela de console deixa de estar visível em **< 2 s** após o arranque
- [ ] Uma falha de arranque (porta inutilizável, dependência corrompida) produz mensagem legível
      que **permanece na tela** até o usuário fechá-la — **0** casos de saída silenciosa

## Acceptance Tests

| ID | Cenário | Given | When | Then |
|----|---------|-------|------|------|
| AT-100 | **Link salvo funciona** | A pessoa salvou o link nos favoritos numa execução anterior, que já terminou | Ela sobe o app e abre o favorito | A UI carrega e opera normalmente, **sem** passo extra e **sem** mensagem de sessão expirada |
| AT-101 | Segunda execução | O app roda e serve em `47821` | O usuário executa o `.exe` de novo | O 2º processo encerra com código 0 **em silêncio**: **nenhuma** aba é aberta e segue existindo **1** servidor |
| AT-101b | Subida silenciosa no login | O autostart está ligado | O usuário faz login no Windows | O app sobe e serve, **sem** abrir aba e **sem** janela visível |
| AT-101c | Subida pelo atalho | Nenhuma instância roda | O usuário executa o atalho | O app sobe **e** abre a aba — este é o único caso em que ele abre navegador |
| AT-102 | Instância morta | O app anterior foi morto sem limpeza | O usuário executa o `.exe` | Uma instância nova sobe normalmente, sem bloqueio e sem intervenção manual |
| AT-103 | Porta ocupada por terceiro | Outro serviço qualquer escuta em `47821` | O usuário executa o `.exe` | O app **não** confunde o intruso com uma instância própria; sobe em porta alternativa (preserva AT-009) |
| AT-104 | Encerrar pela UI | O app roda, sem download em curso | O usuário aciona Encerrar | O servidor fecha, o processo sai, a porta é liberada e a UI mostra que o app foi encerrado |
| AT-105 | Encerrar durante download | Um download está em progresso | O usuário aciona Encerrar | O download é abortado e **nenhum** `yt-dlp`/`ffmpeg` sobrevive (mantém a garantia do AT-011) |
| AT-106 | Console some | O app arranca com sucesso | O servidor começa a servir | A janela de console deixa de estar visível |
| AT-107 | Falha antes do servidor | Uma condição impede o arranque | O usuário executa o `.exe` | A mensagem de erro fica **visível e legível**; o console **não** foi liberado ainda |
| AT-108 | Sessão inválida ainda se explica | Uma aba tem credencial que o servidor recusa | A UI consulta o estado | A mensagem de sessão expirada entregue em `b2551d9` continua aparecendo — ela deixa de ser o caminho comum, mas **não** pode sumir |
| AT-109 | CSRF local continua barrado | O app roda e serve | Uma página de outra origem tenta disparar `/api/baixar` | O pedido é recusado; a proteção que o token dá hoje **não** pode ser perdida em troca do link estável |
| AT-110 | Autostart é reversível | O autostart foi ligado pela UI | O usuário o desliga | O app deixa de subir no login seguinte, sem resíduo de configuração |

## Out of Scope

- **Migrar o `.exe` para subsistema GUI** na compilação — inviável hoje (ver Constraints) e
  desnecessário: o resultado visível é o mesmo por outro caminho
- **Ícone próprio do executável** — o mesmo issue do Bun que quebra o flag do console também
  reporta `--windows-icon` falhando; é cosmético e não pertence ao ciclo de vida
- **Bandeja do sistema / minimizar para tray** — capacidade nova, não correção de ciclo de vida
- **Auto-encerrar quando a última aba fecha** — avaliado e descartado nesta fase: um refresh ou
  queda momentânea de conexão pode ser lido como "fechou" e matar o app durante o uso
- **Assinatura de código / SmartScreen** — decisão de custo já registrada, independente daqui
- **Multi-plataforma** — o alvo continua Windows 10/11 x64

## Constraints

| Tipo | Restrição | Impacto |
|------|-----------|---------|
| Técnica | **`--windows-hide-console` do Bun não funciona.** Verificado em 2026-07-21 com Bun **1.3.14** nesta máquina: compilado **com** e **sem** `--target=bun-windows-x64`, o cabeçalho PE dos dois binários continuou `SUBSYSTEM=3` (CONSOLE), igual ao baseline sem o flag. Bug aberto no upstream: [oven-sh/bun#19916](https://github.com/oven-sh/bun/issues/19916), com [#24164](https://github.com/oven-sh/bun/issues/24164) reportando o mesmo em `Windows NT 10.0.26200` — o build exato desta máquina | O caminho documentado está fechado; o DESIGN precisa da alternativa de runtime |
| Técnica | **`FreeConsole()` via `bun:ffi` funciona.** Verificado em 2026-07-21: `GetConsoleWindow()` devolveu handle `330058` antes e `null` depois, com `FreeConsole()` retornando sucesso | Viabiliza o goal SHOULD sem depender do flag quebrado |
| Técnica | Por ser chamada em **runtime**, `FreeConsole` **não** restringe cross-compile — ao contrário do flag do Bun, que a doc diz não funcionar em cross-compile | Preserva a opção de build Linux→Windows na futura CI de release (item aberto no backlog) |
| Técnica | Detachar o console **descarta** `console.log`/`console.error` | O momento de detachar é requisito, não detalhe: AT-107 exige que falhas anteriores ao arranque continuem visíveis |
| Técnica | Não existe forma confiável de **focar** uma aba já aberta no navegador | Por isso a 2ª execução não tenta abrir nada (AT-101): abrir aba nova seria justamente o "coisas aparecendo" que o produto quer evitar |
| Segurança | **O link estável não pode custar a proteção contra CSRF local.** Hoje quem a garante é o token por-execução na URL; sem ele, uma página de outra origem consegue disparar `POST /api/baixar` (o `Host` é preenchido pelo navegador, então a allowlist de `guards.ts` não barra) | AT-109 é inegociável. Uma direção viável — a validar no DESIGN — é tirar o token da URL e servi-lo numa rota *same-origin*: o CORS impede leitura cross-origin, e de quebra o token some do histórico do navegador |
| Segurança | Porta **fixa** (`47821`) é pré-condição do link estável, e hoje o fallback do `EADDRINUSE` muda a porta (`http.ts:91`) | O fallback precisa continuar existindo (AT-103), mas cair nele **quebra** o favorito — o DESIGN precisa dizer o que a pessoa vê nesse caso |
| Produto | O app não pode exigir Gerenciador de Tarefas para encerrar | Torna o botão Encerrar um MUST, não um SHOULD |
| Produto | Autostart mexe em configuração do Windows do usuário | Precisa ser **opt-in** e reversível pela própria UI (AT-110); nunca ligado sem consentimento |

## Contexto técnico (para o Design)

| Aspecto | Valor | Notas |
|---------|-------|-------|
| **Localização do código** | `src/main.ts` (arranque/encerramento), `src/server/http.ts` (rota de shutdown), `src/ui/` (controle na UI), `scripts/build.mjs` | O ciclo de vida hoje está espalhado entre `main.ts` e `http.ts` |
| **Domínios de KB** | — | KB ainda não treinada neste projeto |
| **Impacto de infra/IaC** | nenhum | App local; não toca CI nem release |

## Assumptions

| ID | Premissa | Se errada, impacto | Validada? |
|----|----------|--------------------|-----------|
| A-101 | `FreeConsole` esconde a janela de forma estável nas versões-alvo do Windows | O goal SHOULD cai; o app volta a exibir console e resta documentá-lo | [x] verificado em Windows 11 Pro 10.0.26200 |
| A-102 | A janela pisca brevemente antes do `FreeConsole` (o processo nasce CONSOLE) | Se o flash for longo demais, a experiência fica pior que uma janela estável | [ ] medir no DESIGN — SC exige < 2 s |
| A-103 | Uma instância viva pode ser identificada **positivamente** como sendo deste app, não só "algo escuta na 47821" | Sem isso, AT-103 falha e o app pode entregar o usuário a um serviço alheio | [ ] o DESIGN escolhe o mecanismo |
| A-104 | Encerrar pela UI é gesto suficientemente discoverable sem tray/menu | A pessoa continua fechando só a aba, e o problema persiste em outra forma | [ ] observar após entrega |
| A-105 | A porta `47821` está livre na máquina das pessoas do grupo | Cai no fallback de porta e o link salvo quebra — o principal fluxo do produto | [ ] o DESIGN precisa de resposta para o caso |
| A-106 | O grupo consegue salvar um link nos favoritos sem instrução detalhada | O fluxo pretendido não acontece e todos continuam pelo atalho | [ ] a landing cobre isso (goal COULD) |

## Clarity Score

| Elemento | Nota (0–3) | Notas |
|----------|------------|-------|
| Problema | 3 | Sintoma observado no código, com arquivo e linha |
| Usuários | 2 | Um único perfil real; descrito de forma fina, sem pesquisa por trás |
| Goals | 3 | Priorizados, com a dependência entre eles explicitada |
| Success | 3 | Todos com número e forma de medir |
| Scope | 3 | Fronteira explícita, com o descartado e o motivo |
| **Total** | **14/15** | Acima do gate (12) |

## Perguntas em aberto

Nenhuma bloqueante para o DESIGN. Cinco itens ficam **deliberadamente** para lá, por serem escolha
de mecanismo e não de requisito:

1. Como identificar positivamente a instância própria (A-103) — lockfile com PID, handshake numa
   rota do próprio servidor, named mutex do Windows
2. Em que ponto exato do arranque chamar `FreeConsole`, satisfazendo AT-106 e AT-107 juntos
3. Se o controle de Encerrar precisa de confirmação quando há download em curso (AT-105 define o
   comportamento, não a interação)
4. **Como o link fica estável sem perder o AT-109** — token same-origin, token persistido em disco,
   ou outra via. O requisito é o link funcionar **e** o CSRF continuar barrado; o caminho é do DESIGN
5. **O que a pessoa vê quando a porta `47821` está ocupada** (A-105) e o favorito, portanto, não
   aponta para o app

---

**Próximo passo:** `/design .claude/sdd/features/DEFINE_CICLO_DE_VIDA.md`

# DEFINE: Downloader local com Web UI

> Executável único para Windows que sobe uma interface web local e baixa vídeo ou áudio do
> YouTube usando a conexão do próprio usuário.

## Metadados

| Atributo | Valor |
|----------|-------|
| **Feature** | DOWNLOADER_LOCAL |
| **Data** | 2026-07-20 |
| **Status** | Pronto para Design |
| **Clarity Score** | 13/15 |
| **Brainstorm de origem** | [`BRAINSTORM_ARQUITETURA_ENTREGA.md`](BRAINSTORM_ARQUITETURA_ENTREGA.md) |
| **Revisão** | 2026-07-20 — emendado após a onda `01-tools-media` da KB (ver *Histórico de revisão*) |

---

## Problema

Baixar um vídeo ou o áudio de um vídeo do YouTube hoje obriga a pessoa não-técnica a escolher
entre sites intermediários carregados de anúncio e redirecionamento enganoso, ou ferramentas de
linha de comando (`yt-dlp`) que ela não sabe instalar nem operar. Não há caminho gratuito, direto
e confiável entre esses dois extremos.

## Usuários-alvo

| Usuário | Papel | Dor |
|---------|-------|-----|
| Pessoa não-técnica no Windows | Usuário final primário | Não usa terminal; sites de download a expõem a anúncio/malware e falham sem explicar por quê |
| Autor do projeto | Usuário secundário e mantenedor | Quer a mesma função sem depender de site de terceiro, e sem custo recorrente |

## Goals (priorizados)

| Prioridade | Goal |
|------------|------|
| **MUST** | Baixar o **vídeo** de uma URL do YouTube em MP4, na melhor qualidade disponível |
| **MUST** | Baixar só o **áudio** de uma URL do YouTube em MP3 |
| **MUST** | Rodar a partir de um **único executável** Windows, sem instalar Node, Python, `yt-dlp` ou `ffmpeg` à mão |
| **MUST** | Abrir a interface **sozinho no browser** ao executar |
| **MUST** | Manter o `yt-dlp` **atualizado em runtime**, sem exigir novo download do executável |
| **MUST** | Transformar falha (URL inválida, vídeo indisponível, sem rede) em **mensagem compreensível**, nunca stack trace |
| **SHOULD** | Painel **avançado recolhido** com escolha de resolução (1080p/720p/480p) e formato de áudio |
| **SHOULD** | Mostrar **progresso** do download e do preparo das dependências no 1º uso |
| **COULD** | Deixar o usuário escolher a pasta de destino (default: `Downloads`) |
| **COULD** | Lembrar a última preferência (vídeo/áudio, resolução) entre execuções |

## Success Criteria (mensuráveis)

- [ ] **SC-1** — Do duplo-clique no `.exe` até a UI visível no browser: **≤ 5 s** (execução já
      com dependências em cache).
- [ ] **SC-2** — Primeira execução, incluindo baixar `yt-dlp` + `ffmpeg`: **≤ 3 min** numa conexão
      de 20 Mbps, com progresso visível durante todo o período.
- [ ] **SC-3** — Vídeo de 10 min em 1080p baixa e fica pronto em disco em **≤ 3 min** numa conexão
      de 20 Mbps.
- [ ] **SC-4** — **0** dependências que o usuário precise instalar manualmente.
- [ ] **SC-5** — **100%** dos modos de falha listados nos Acceptance Tests (AT-005 a AT-009)
      produzem mensagem em pt-BR acionável; **0** stack traces expostos na UI. Inclui um
      **fallback genérico obrigatório**: falha não reconhecida vira mensagem compreensível, nunca
      texto cru do yt-dlp (ver A-006 — não há canal estruturado de erro).
- [ ] **SC-6** — Executável distribuído: **≤ 120 MB** (ver A-002).
- [ ] **SC-7** — O `yt-dlp` em uso está na versão mais recente ou **≤ 7 dias** atrás dela, sem
      ação do usuário. A atualização roda **em paralelo** à subida da UI e **nunca bloqueia** o
      arranque (senão conflita com SC-1) nem um download em andamento.
- [ ] **SC-8** — O **ffmpeg** tem ciclo de vida próprio: versão **pinada e verificada por hash**,
      trocada só com nova versão do executável. Não existe auto-update de ffmpeg (SC-7 cobre
      apenas o `yt-dlp`).

## Acceptance Tests

| ID | Cenário | Given | When | Then |
|----|---------|-------|------|------|
| AT-001 | Happy path — vídeo | App rodando, dependências em cache | Usuário cola URL válida, escolhe **Vídeo**, confirma | Arquivo **`.mp4`** reproduzível aparece em `Downloads`; UI mostra conclusão e o caminho. **O container é MP4 mesmo quando o seletor resolve num formato progressivo** — `--merge-output-format` é ignorado se não há merge, então o remux precisa ser garantido explicitamente |
| AT-002 | Happy path — áudio | Idem | Usuário cola URL válida, escolhe **Áudio**, confirma | Arquivo `.mp3` reproduzível aparece em `Downloads`, com metadados de título/artista quando disponíveis. **Falha de pós-processamento conta como falha do download** — o app não anuncia sucesso sem arquivo em disco |
| AT-003 | Primeira execução | Máquina limpa, sem cache de dependências | Usuário executa o `.exe` pela 1ª vez | UI abre, informa que está preparando as dependências, mostra progresso e habilita o download ao terminar — sem pedir nada ao usuário |
| AT-004 | Painel avançado | App rodando | Usuário abre "Avançado" e escolhe 720p | O arquivo resultante tem altura de 720px **quando o vídeo oferece 720p**; quando não oferece, o app **degrada para a melhor altura disponível** e informa o que entregou — nunca falha por ausência do formato pedido |
| AT-005 | URL inválida | App rodando | Usuário cola texto que não é URL do YouTube | UI recusa antes de tentar baixar, explicando o formato esperado; nenhum processo é disparado |
| AT-006 | Vídeo indisponível | App rodando | Usuário cola URL de vídeo privado/removido/restrito por região | UI informa **qual** dessas causas ocorreu, em pt-BR; app segue utilizável. **Não confundir com AT-008**: `"This content isn't available, try again later"` é rate limit, não indisponibilidade |
| AT-012 | Sonda antes do download | App rodando | Usuário submete qualquer URL | App consulta metadados com `-J` (que simula, sem baixar) **antes** de iniciar o download; falhas de AT-006/007/008 aparecem aí, sem consumir banda, e o painel avançado é montado com as resoluções **reais daquele vídeo** |
| AT-013 | Falha desconhecida | App rodando | O yt-dlp falha com mensagem que o app não sabe classificar | UI mostra mensagem genérica compreensível em pt-BR e oferece copiar o detalhe técnico; **nunca** despeja o texto cru como se fosse a mensagem final (SC-5) |
| AT-007 | Sem rede | Máquina sem conexão | Usuário tenta baixar | UI informa ausência de conexão e sugere tentar de novo; app não trava nem fecha |
| AT-008 | Detecção de bot | YouTube responde exigindo verificação | Usuário tenta baixar | UI explica que o YouTube bloqueou a requisição e sugere tentar mais tarde — **sem** contornar com proxy, cookies de terceiro ou spoof de cliente |
| AT-009 | Porta ocupada | Porta default do servidor local em uso | Usuário executa o `.exe` | App escolhe outra porta livre e abre o browser nela; nenhum erro exibido |
| AT-010 | Atualização do `yt-dlp` | Cache com `yt-dlp` desatualizado | Usuário executa o app | App atualiza o `yt-dlp` sem intervenção e sem impedir o uso |
| AT-011 | Encerramento | App rodando com UI aberta | Usuário fecha a janela do app | Servidor local encerra; nenhum processo órfão fica em execução |

## Out of Scope

- Hospedar o download em servidor (Pages fica só com landing/instruções — decidido no BRAINSTORM).
- macOS e Linux no v1.
- Playlists e downloads em lote.
- Legendas, capítulos e thumbnails.
- Histórico persistente e fila de downloads.
- Contas, autenticação, quotas.
- Assinatura de código do executável (custa certificado; alerta do SmartScreen é aceito no v1).
- Auto-update do próprio executável (só o `yt-dlp` se atualiza).
- **Qualquer forma de burlar detecção de bot**: proxy residencial, cookies de conta de terceiro,
  spoof de cliente.

## Constraints

| Tipo | Restrição | Impacto |
|------|-----------|---------|
| Custo | **Zero**, rígido | Sem servidor, sem proxy pago, sem certificado de assinatura |
| Técnica | Download deve sair do **IP residencial** do usuário | Determina toda a arquitetura (BRAINSTORM); nada roda em datacenter |
| Técnica | Stack TypeScript/Node (`project-context.md`) | Executável embute o runtime Node — ver A-002 |
| Técnica | `yt-dlp` quebra com frequência | Obriga atualização em runtime (SC-7, AT-010) |
| Plataforma | Windows 10/11 x64 | Único alvo de build e teste do v1 |
| Legal | Baixar do YouTube conflita com os ToS da plataforma | Ferramenta local, uso individual; sem serviço público em nome do autor |
| Repositório | **Privado durante o desenvolvimento**, público na publicação | Decidido em 2026-07-20 — ver *Plano de publicação* |

### Plano de publicação (decidido em 2026-07-20)

O repositório (`Phenrique-DataDev/youtube-downloader`) fica **privado até estar implementado e
testado**, e só então migra para público. Consequências que valem para o DESIGN e o BUILD:

| Enquanto privado | Ao abrir para público |
|------------------|------------------------|
| **GitHub Pages não publica** — no plano Free, Pages exige repositório público. A landing fica só no código, sem ir ao ar | Landing entra no ar; passa a ser a mitigação do SmartScreen (ver `build-release-specialist`) |
| **Actions consome cota**: plano Free dá 2.000 min/mês em repo privado, e **runner Windows conta 2×** — ou seja, ~1.000 min reais de build Windows | Runners padrão voltam a ser **gratuitos e sem teto**, restaurando o custo zero integral |
| CI deve ser econômico: evitar build a cada push, preferir build sob tag/release | CI pode ser mais liberal |

**Atenção ao migrar:** tornar o repositório público expõe **todo o histórico de commits**, não só o
estado atual. Antes de abrir, revisar o histórico (o `secret-scan` do `.githooks/` cobre o
working-tree; histórico exige varredura própria — ver `security-reviewer`).

## Contexto técnico (para o Design)

| Aspecto | Valor | Notas |
|---------|-------|-------|
| **Localização do código** | `src/` (a criar) | Layout definitivo derivado do framework escolhido no DESIGN |
| **Domínios de KB** | typescript/node, mídia (`yt-dlp`/`ffmpeg`), empacotamento de binário, github-actions | KB ainda não povoada — `/train-kb` pendente no `/init` |
| **Impacto de infra/IaC** | Novo | Workflow de release no Actions + GitHub Pages para a landing |

## Assumptions

| ID | Premissa | Se errada, impacto | Validada? |
|----|----------|--------------------|-----------|
| A-001 | Baixar `yt-dlp` e `ffmpeg` no 1º uso é aceitável para o usuário-alvo | Se não, tem de embutir tudo — executável passa de 150 MB e o ffmpeg envelhece junto | [ ] |
| A-002 | Executável Node autocontido cabe em ≤ 120 MB (SC-6) | Se estourar, revisar SC-6 ou trocar a estratégia de empacotamento (Node SEA × Bun × outro) | [ ] |
| A-003 | Números de SC-1/SC-2/SC-3 são atingíveis na stack escolhida | São metas derivadas de expectativa de UX, não medições — recalibrar no BUILD com medição real | [ ] |
| A-004 | Alerta do SmartScreen não afasta o usuário-alvo a ponto de inviabilizar a distribuição | Se afastar, assinatura de código volta ao escopo e deixa de ser custo zero | [ ] |
| A-005 | Rodar do IP residencial evita a detecção de bot na maioria dos usos | Se o bloqueio for frequente mesmo assim, AT-008 deixa de ser caso de borda e vira o problema central do produto | [ ] |
| A-006 | Classificar erro por texto de `stderr` é frágil e quebra sem deploy | **Confirmado** pela KB: não há canal estruturado de erro (só `--progress-template` para progresso). Como o `yt-dlp` se atualiza sozinho (SC-7), a atualização pode quebrar a classificação silenciosamente — por isso o fallback genérico do SC-5 é obrigatório, não opcional | [x] |
| A-007 | O `yt-dlp.exe` baixado da release é atualizável via `-U` | `is_non_updateable()` bloqueia o updater em certas variantes de instalação. Se cair nessa categoria, SC-7 passa a depender do app implementar a atualização inteira, não só o bootstrap — **verificar empiricamente no BUILD** | [ ] |
| A-008 | Preservar o nome original do binário do `yt-dlp` no cache | O checksum é buscado por **sufixo do nome** no `SHA2-256SUMS`; renomear o executável faz a verificação de integridade ser **pulada em silêncio** (só warning) | [x] |

## Clarity Score

| Elemento | Nota (0–3) | Notas |
|----------|------------|-------|
| Problema | 3 | Quem sofre e o impacto estão concretos |
| Usuários | 2 | Persona derivada do contexto do autor, sem validação com usuário real |
| Goals | 3 | Priorizados, sem ambiguidade entre MUST e SHOULD |
| Success | 2 | Todos numéricos, mas SC-1/2/3 são metas de UX ainda não medidas (A-003) |
| Scope | 3 | Out of scope explícito, incluindo o que não se fará por princípio |
| **Total** | **13/15** | Acima do gate (12); as duas notas 2 estão rastreadas em A-003 e no risco de persona |

## Perguntas em aberto

Nenhuma bloqueante — pronto para Design. Pontos a resolver **dentro** do DESIGN:

1. Estratégia de empacotamento do executável (Node SEA × Bun × alternativa), que decide A-002.
2. Framework da Web UI local e como ele se relaciona com a landing do GitHub Pages — se
   compartilham código ou são independentes.
3. Como garantir o container MP4 do AT-001 quando não há merge (`--remux-video` × filtro de
   codec na origem).
4. Seletor do painel avançado: `-f` (rígido, falha se ausente) × `-S` (ordena e degrada sozinho)
   — o AT-004 revisado pede comportamento de `-S`.
5. Como a atualização do `yt-dlp` roda em paralelo à subida da UI sem violar SC-1.

---

## Histórico de revisão

### 2026-07-20 — emenda pós-KB (onda `01-tools-media`)

A curadoria da KB consultou a documentação atual do `yt-dlp` via context7 e encontrou
contradições com esta spec. Corrigido:

| Item | Antes | Depois | Origem |
|------|-------|--------|--------|
| SC-5 | Mensagem acionável para todos os modos de falha | + **fallback genérico obrigatório** | Não existe canal estruturado de erro (A-006) |
| SC-7 | "`yt-dlp` atualizado" (implicava cobrir tudo) | Só `yt-dlp`, **em paralelo** à UI | Conflitava com SC-1; ffmpeg não é coberto |
| SC-8 | — (inexistente) | **Novo**: ffmpeg pinado, verificado por hash | ffmpeg não tem auto-update |
| AT-001 | "Arquivo `.mp4`" | + garantir container quando não há merge | `--merge-output-format` é ignorado sem merge |
| AT-002 | "Arquivo `.mp3`" | + falha de pós-processamento = falha do download | `-i/--ignore-errors` reporta sucesso sem arquivo |
| AT-004 | "Resultado tem 720px" | + degradação explícita quando não há 720p | `-f` rígido falha; `-S` degrada |
| AT-006 | Privado/removido/geo | + não confundir com rate limit (AT-008) | `"try again later"` é rate limit |
| AT-012 | — (inexistente) | **Novo**: sonda `-J` antes de baixar | `-J` simula por default — falhas antes de gastar banda |
| AT-013 | — (inexistente) | **Novo**: falha não classificada | Fecha o furo do SC-5 |
| A-006/007/008 | — (inexistentes) | **Novas** premissas | Fragilidade de `stderr`, `is_non_updateable()`, checksum por nome |

Conhecimento de origem: `.claude/kb/tools/media/` (4 entradas, `source: context7`,
`checked_at: 2026-07-20`).

---

**Próximo passo:** `/design .claude/sdd/features/DEFINE_DOWNLOADER_LOCAL.md`

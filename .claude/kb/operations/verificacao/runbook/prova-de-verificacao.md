---
id: prova-de-verificacao
layer: operations
domain: verificacao
content_type: runbook
status: active
related: []
promoted_from: [CICLO_DE_VIDA, DOWNLOADER_LOCAL]
---

# Prova de verificação — antes de declarar algo verificado

> Camada: `operations` · Domínio: `verificacao`

Promovida de duas features (`DOWNLOADER_LOCAL`, `CICLO_DE_VIDA`) que tropeçaram no mesmo erro por
cinco vezes independentes: **tratar uma alegação como se fosse uma medição**. Este runbook é o que
se roda antes de escrever "✅" numa tabela de Success Criteria, Acceptance Test ou BUILD_REPORT.

## O predicado

Uma afirmação de verificação precisa passar nas **duas** perguntas. Falhar em qualquer uma significa
que ainda não se verificou nada — independentemente de a suíte estar verde.

| Pergunta | O que ela pega |
|----------|----------------|
| **Isto poderia falhar?** | Prova não-falsificável — passaria mesmo se a defesa não existisse |
| **Isto foi medido agora, contra o artefato de agora?** | Evidência velha ou inexistente — mede-se o passado, ou não se mede |

## Modalidade A — a prova não é falsificável

Verde não prova guarda. Um teste que passa tanto com a defesa quanto sem ela não cobre a defesa;
cobre a si mesmo.

**O procedimento:** para cada defesa nova, **remova-a** e rode a suíte. Se nenhum teste morre, a
defesa está descoberta — o verde era decorativo. Restaure o arquivo e confira com `diff`.

Em `CICLO_DE_VIDA`, 15 mutações foram aplicadas a defesas dadas como cobertas. Treze mataram testes.
**Duas não** — e essas duas eram exatamente onde a cobertura era ilusória. Uma virou fix
(`res.on('close')` no lugar de `req.on('close')`, que fazia o `AbortSignal` nunca disparar); a outra
(`setImmediate` de `/api/encerrar`) foi declarada como lacuna em vez de ser contada como coberta.

O mesmo predicado vale fora de teste. Em `DOWNLOADER_LOCAL` o M4A foi implementado com `-x
--audio-format m4a` e um comentário afirmando que aquilo copiava a trilha sem reconverter. A medição
antes do commit mostrou o contrário: `-x` puxa a melhor trilha (opus no YouTube) e o ffmpeg
recodificava para AAC — **8,7 MB a 338 kbps a partir de uma origem de 3,3 MB**, maior que o MP3 e com
perda de geração. O comentário estava escrito com convicção; convicção não é um método.

### O controle: o resultado sobreviveria sem a intervenção?

Uma medição que confirma o esperado ainda pode ser falso verde se **a causa não foi isolada**. Na
primeira medição do SC-3 (encerrar mata a árvore de `yt-dlp`), os processos filhos de fato morriam —
mas morriam sozinhos, porque o vídeo terminava de baixar rápido demais. Só uma **prova de
estabilidade** (10 s sem intervenção nenhuma: eles sobreviveriam?) desmascarou isso, e a causação só
ficou provada com a árvore capturada viva, apagando o cache e apertando o timing.

Antes de creditar um efeito à sua mudança, pergunte o que teria acontecido **sem** ela.

## Modalidade B — a evidência é velha ou não existe

### Reconstrua o artefato antes de medir

Medir contra binário desatualizado é medir o passado. Em `CICLO_DE_VIDA`, o `.exe` em `dist/` era
anterior às duas levas e **concordava com o código velho**, mascarando dois testes de contrato até
ser reconstruído. Qualquer projeto que empacota herda essa armadilha: o artefato de verificação é
uma cópia, e cópias envelhecem em silêncio.

### Rode a suíte; não cite o número da última vez que ela rodou

Em `DOWNLOADER_LOCAL`, o ADR 0002 inverteu de propósito a precedência de assets. Um teste de
integração seguiu cobrando a precedência **antiga** e ficou vermelho por **quatro commits** sem que
ninguém notasse — porque o BUILD_REPORT exibia "24 passed" de uma rodada anterior, e o relatório era
lido no lugar da suíte.

Duas consequências operacionais:

- **Ao inverter uma decisão de design, procure os testes que afirmam a decisão antiga.** Eles não
  acusam a mudança; eles falham, e uma falha esperada vira ruído tolerado.
- **Número em relatório é histórico, não estado.** Se a afirmação é sobre agora, a rodada é agora.

### Um critério sem linha de evidência é um critério não verificado

SC-4 e SC-5 de `DOWNLOADER_LOCAL` chegaram ao `/ship` sem nenhuma linha na tabela do BUILD_REPORT. A
substância existia no código o tempo todo — o que faltava era alguém ter conferido. Ausência de
linha não é "provavelmente ok": é ausência de verificação, e foi o pré-requisito do `/ship` que
forçou o achado.

Em `CICLO_DE_VIDA` a mesma recusa encontrou **dois defeitos reais** que a suíte inteira não pegava
(árvore de `yt-dlp` órfã e app zumbi segurando a porta). Se o SHIPPED tivesse sido escrito na
sensação de que bateu, os dois iriam para produção com selo de aprovado.

## Checklist

Antes de escrever ✅ em qualquer critério:

- [ ] Existe uma **linha de evidência** por critério — medida, log ou saída real, não uma asserção
- [ ] A medição saiu de um **artefato reconstruído** a partir do código atual
- [ ] A suíte foi **rodada agora**; nenhum número foi copiado de relatório anterior
- [ ] Cada defesa nova **morre sob mutação** — ou a lacuna está declarada, não maquiada
- [ ] O efeito foi **isolado do controle**: sem a mudança, o resultado seria diferente
- [ ] Comentários e docstrings tocados afirmam o que foi **medido**, não o que se pretendia

## O que NÃO fazer

| Não faça | Por quê |
|----------|---------|
| Contar como coberta uma defesa que a mutação não mata | É teatro de cobertura — declare a lacuna |
| Medir contra binário/artefato empacotado antes da mudança | Concorda com o código velho e mascara regressão |
| Citar contagem de testes de uma rodada anterior | Histórico não é estado |
| Deixar critério sem linha de evidência com "claramente atingido" | O gate existe exatamente para essa frase |
| Escrever comentário afirmando comportamento não medido | Convicção não protege de nada |

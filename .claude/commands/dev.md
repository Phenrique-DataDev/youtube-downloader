---
description: "Dev Loop — tarefa pequena sem o ciclo SDD completo"
argument-hint: "<descrição da tarefa>"
---

# /dev — Dev Loop

Atalho para tarefas pequenas: utilitários, scripts de um arquivo, ajustes, protótipos.
Use quando o SDD de 5 fases seria peso demais.

## Quando NÃO usar
Se a tarefa envolve várias partes, decisões de arquitetura ou requisitos ambíguos,
prefira o SDD: comece por `/brainstorm` ou `/define`.

## Processo
1. Confirme o objetivo de `$ARGUMENTS` em 1 frase e os critérios de "pronto".
2. Leia `project-context.md` para respeitar stack e convenções.
3. Implemente de forma enxuta, em branch de trabalho.
4. **Verifique:** rode lint/testes pertinentes; mostre a saída real.
5. Resuma o que mudou e os arquivos afetados.

## Trilha de redesign de tela

Quando `$ARGUMENTS` é refazer a cara de uma tela que já existe (layout, hierarquia, componentes),
sem mudar dado, fluxo nem contrato, o processo acima vira estas 4 etapas. Se mexer em dado, fluxo
ou contrato, não é redesign: vá para o `/define`.

1. **Brief.** A tela (rota ou arquivo), o que incomoda nela, o que não pode mudar e as larguras que
   contam. Leia `.claude/rules/design-system.md`, se existir. Peça: subagente `designer`, modo
   **Refinar**.
2. **Protótipo antes/depois.** Registre o **antes** com a skill `visual-check`, nas larguras do
   brief. Com ≥ 2 direções viáveis, compare-as com a skill `decision-preview`; com uma só, o
   `designer` devolve o protótipo (canvas, ou briefing sem `Artifact`).
3. **Aprovação.** O usuário escolhe pela pergunta que fecha o `decision-preview`, ou por
   `AskUserQuestion`. A direção aprovada vira a spec. **Sem aprovação, não implemente.**
4. **Implementação + `visual-check`.** Implemente a direção aprovada e rode o `visual-check` nas
   mesmas larguras do antes. A entrega é o par antes/depois com o PNG de cada largura; sem rota
   calibrada, diga "verificação visual não rodou" e o que ficou sem ver.

## Regras
- Sem cerimônia de artefatos SDD — mas a mesma disciplina de verificação.
- Conventional Commits; não tocar `main` sem confirmação.

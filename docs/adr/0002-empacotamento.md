# ADR 0002 — Empacotamento: Bun `--compile` sobre Node SEA

| | |
|---|---|
| **Data** | 2026-07-21 |
| **Status** | Aceita |
| **Contexto SDD** | Feature `DOWNLOADER_LOCAL`, pendência do [BUILD_REPORT](../../.claude/sdd/reports/BUILD_REPORT_DOWNLOADER_LOCAL.md) (SC-6) |
| **Implementa** | [`scripts/build.mjs`](../../scripts/build.mjs) |

## Contexto

O DESIGN escolheu `bun build --compile` como primário e Node SEA como plano B, mas deixou a
decisão **explicitamente aberta**: *"a escolha não está fechada por preferência: o BUILD deve
medir os dois `.exe` e o CI falha se exceder 120 MB (SC-6)"*.

Os dois foram construídos e medidos.

## Medição (2026-07-21, mesma máquina, Node 24.16, Bun 1.3.14)

| Critério | Bun `--compile` | Node SEA |
|---|---|---|
| Tamanho | 94,0 MB | **88,2 MB** |
| Arranque até responder HTTP | ~360 ms | ~320 ms |
| Passos de build | **1 comando** | 5 (bundle → config → blob → copiar `node.exe` → `postject`) |
| Dependência extra | — | `postject` |
| Cross-compile | **sim** (`--target=bun-windows-x64`) | não — exige runner Windows |
| Teto SC-6 (120 MB) | ✅ 22% de folga | ✅ 27% de folga |

## Decisão

**Bun `--compile`.**

O SEA vence no único critério em que vence — 5,8 MB, ou 6% — e esses 5,8 MB **não compram
nada**: os dois folgam o teto de 120 MB com mais de 20%. Contra isso, o SEA custa cinco passos,
uma dependência a mais e um runner Windows na CI, que o próprio DESIGN já sinalizou consumir
**2× a cota** em repositório privado.

Quando o tamanho é irrelevante para a decisão, ela se resolve por custo de manutenção — e aí
não é páreo.

A medição, portanto, **confirmou** a escolha primária do DESIGN em vez de derrubá-la. Registrar
isso importa: o valor de ter medido não foi mudar de rumo, foi deixar de apostar.

## O bug que a medição revelou

Não estava previsto e é o achado mais importante do episódio.

`main.ts` resolvia a raiz da UI por `dirname(fileURLToPath(import.meta.url))`. Ao empacotar, o
bundler **assa esse valor no binário**: o `.exe` gerado nesta máquina carregava
`file:///C:/Users/.../youtube-downloader/src/main.ts` embutido e servia a UI da pasta de código
do desenvolvedor.

O sintoma foi enganoso ao ponto de quase inverter a decisão:

| | O que aconteceu |
|---|---|
| Bun | `HTTP 404` — falhou honestamente |
| Node SEA | `HTTP 200`, servindo os arquivos reais — **passou por acidente** |

O SEA "funcionava" apenas porque o caminho assado existia naquela máquina. Julgado por esse
teste, o SEA pareceria a opção correta e o Bun o quebrado. Na máquina de qualquer usuário os
dois dariam 404.

### Correção

- [`scripts/gerar-ativos.mjs`](../../scripts/gerar-ativos.mjs) embute os arquivos da UI num
  módulo TypeScript antes do bundle.
- [`src/ui/ativos.ts`](../../src/ui/ativos.ts) resolve **embutido primeiro**; disco é apenas
  conveniência de desenvolvimento e nunca responde no binário.
- [`tests/integration/empacotamento.test.ts`](../../tests/integration/empacotamento.test.ts)
  copia o `.exe` para um diretório temporário e só então o executa — rodar de dentro do projeto
  reproduziria exatamente o falso positivo. Verifica também que o caminho da máquina de build
  **não** aparece no binário, com controle positivo confirmando que a busca enxerga strings.

## Consequências

- `npm run build` produz `dist/youtube-downloader.exe` e imprime tamanho + SHA256 (o Release
  publica ambos, conforme o DESIGN).
- O gate do SC-6 **falha o build**, não avisa: passar de 120 MB é decisão de produto — o usuário
  baixa este arquivo —, não algo que se descobre no Release.
- `src/ui/ativos.gerado.ts` é gerado e **gitignored**; `dev`, `typecheck` e `test` o regeneram.
  Versionar criaria divergência silenciosa com os arquivos-fonte da UI.
- Editar CSS/HTML agora exige reiniciar (o app serve o mapa embutido). É o preço de ter um só
  caminho de código entre desenvolvimento e binário — precisamente a divergência que causou o bug.
- **Não verificado:** o cross-compile Linux→Windows. O flag `--target=bun-windows-x64` foi
  exercitado apenas Windows→Windows; só a CI prova o resto.

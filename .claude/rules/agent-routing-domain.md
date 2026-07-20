# Roteamento — agentes de domínio (gerado por `/audit-agents`)

> Específicos do stack/domínio real deste projeto, derivados do `project-context.md`. O catálogo
> **genérico** (experts de papel) vive em [`agent-routing.md`](agent-routing.md) — este arquivo
> **acrescenta**, não substitui.

## Agentes de domínio (`.claude/agents/domain/`)

| Gatilho | Subagent |
|---------|----------|
| Mexer no núcleo de download: seleção de formato, muxing, extração de áudio, progresso, erros do extractor | `media-pipeline-specialist` |
| Empacotar o `.exe`, tamanho do binário, workflow de release, bootstrap/atualização de `yt-dlp`/`ffmpeg`, landing do Pages | `build-release-specialist` |
| Avaliar uma mudança de seletor de formato **antes** de aplicá-la (via `/simulate`) | `ytdlp-simulator` |

## Notas de cobertura

- **UI/frontend** fica com o `designer` do base (universal, agnóstico de stack) — não há
  `frontend-specialist` de propósito, seria duplicação.
- **Higiene de git/PR** fica com `git-workflow`; o `build-release-specialist` cuida do *workflow de
  release e empacotamento*, não da disciplina de commits.
- Não há agente de compliance: a questão de Termos de Serviço do YouTube é decisão registrada no
  DEFINE, não um domínio regulado que justifique um expert.

# youtube-downloader

Baixa vídeo ou áudio do YouTube pela sua própria conexão. Roda na sua máquina e abre a interface
no navegador — nada é enviado para servidor nenhum.

- **Vídeo:** MP4 (H.264), resolução selecionável
- **Áudio:** MP3
- Os arquivos vão para a sua pasta **Downloads**
- Windows 10/11 (64 bits)

## Como usar

1. Baixe o `youtube-downloader.exe`
2. Execute. O navegador abre sozinho na interface
3. Cole a URL, escolha vídeo ou áudio, baixe

Na **primeira execução** o app baixa o `yt-dlp` (17 MB) e o `ffmpeg` (160 MB), verificando o
SHA256 de cada um. Só acontece uma vez. A interface abre antes disso; o botão de download fica
desabilitado até terminar.

> Ainda não há release publicado — por enquanto o `.exe` sai de `npm run build` (ver abaixo).

## Desenvolvimento

Requer Node 22+. Para gerar o `.exe`, também [Bun](https://bun.sh).

```bash
npm install
npm run dev        # roda direto do código-fonte
npm test           # testes unitários
npm run verify     # typecheck + lint + testes
npm run build      # gera dist/youtube-downloader.exe
```

Os testes que falam com o YouTube de verdade ficam separados e só rodam com `TESTE_REDE=1`.

## Licença

[MIT](LICENSE).

O `yt-dlp` e o `ffmpeg` **não** são redistribuídos aqui — são baixados do upstream na primeira
execução e mantêm suas próprias licenças.

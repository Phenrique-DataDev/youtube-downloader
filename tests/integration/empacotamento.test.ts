/**
 * Smoke test do binario empacotado.
 *
 * ESTE TESTE EXISTE POR UM BUG ESPECIFICO. `main.ts` resolvia a raiz da UI por
 * `dirname(fileURLToPath(import.meta.url))`; ao empacotar, o bundler assa esse
 * valor, e o binario gerado nesta maquina passou a servir a UI de
 * `C:/Users/.../youtube-downloader/src/ui`. Ele funcionava perfeitamente aqui e
 * daria 404 em qualquer outra maquina.
 *
 * Nenhum teste unitario pegaria isso — o defeito so existe DEPOIS de empacotar,
 * e so aparece quando o binario roda LONGE do codigo-fonte. Por isso o teste
 * copia o exe para um diretorio temporario antes de subir: rodar de dentro do
 * projeto reproduziria exatamente o falso positivo que ele existe para impedir.
 *
 * Exige `npm run build` antes. Sem o binario, PULA em vez de falhar — quem roda
 * a suite unitaria nao deve ser obrigado a compilar 94 MB.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { access, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const binario = join(process.cwd(), 'dist', 'youtube-downloader.exe');

async function existe(caminho: string): Promise<boolean> {
  try {
    await access(caminho);
    return true;
  } catch {
    return false;
  }
}

const temBinario = await existe(binario);

describe.skipIf(!temBinario)('binario empacotado', () => {
  let processo: ChildProcess;
  let trabalho: string;
  let base: string;

  beforeAll(async () => {
    // Longe do codigo-fonte: e o ponto do teste.
    trabalho = await mkdtemp(join(tmpdir(), 'ytdl-smoke-'));
    const copia = join(trabalho, 'youtube-downloader.exe');
    await copyFile(binario, copia);

    processo = spawn(copia, [], { cwd: trabalho, shell: false, windowsHide: true });

    base = await new Promise<string>((resolver, rejeitar) => {
      const prazo = setTimeout(
        () => rejeitar(new Error('o app nao anunciou a URL em 30 s')),
        30_000,
      );
      processo.stdout?.on('data', (pedaco: Buffer) => {
        // SEM `?t=`: a leva 1 do ciclo de vida tirou o token da URL para que o
        // endereco pudesse ir aos favoritos e sobreviver a proxima execucao.
        // Esta regex cobrava o token ate 2026-07-22 e so passava porque o
        // binario em `dist/` era anterior aquela mudanca — binario velho
        // concordando com teste velho.
        const achado = /http:\/\/127\.0\.0\.1:\d+\//.exec(pedaco.toString());
        if (achado) {
          clearTimeout(prazo);
          resolver(achado[0]);
        }
      });
    });
  }, 60_000);

  afterAll(async () => {
    processo?.kill();
    await rm(trabalho, { recursive: true, force: true }).catch(() => {});
  });

  it('sobe e anuncia uma URL local estavel, sem token', () => {
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    // O contrato mudou na leva 1 e o oposto agora e o requisito: token na URL
    // vazaria para o historico do browser e para o `Referer`.
    expect(base).not.toContain('?t=');
  });

  it.each(['app.css', 'app.js'])(
    'serve %s embutido, sem o codigo-fonte por perto',
    async (nome) => {
      const raiz = base.split('?')[0];
      const resposta = await fetch(`${raiz}${nome}`);

      expect(resposta.status).toBe(200);
      // Corpo real, nao um 404 disfarcado de 200.
      expect((await resposta.text()).length).toBeGreaterThan(1000);
    },
  );

  it('serve a pagina inicial', async () => {
    const resposta = await fetch(base);
    expect(resposta.status).toBe(200);
    expect(await resposta.text()).toContain('<html');
  });

  it('nao carrega caminho da maquina de build embutido', async () => {
    // O sintoma exato do bug: o binario carregava o caminho absoluto de quem
    // compilou. Se ele voltar, a UI vem do disco do desenvolvedor e este teste
    // passa por acidente na maquina errada — entao verificamos o binario.
    const { readFile } = await import('node:fs/promises');
    const conteudo = await readFile(binario, 'latin1');

    expect(conteudo).not.toContain('youtube-downloader/src/main.ts');
    expect(conteudo).not.toContain('youtube-downloader\\src\\main.ts');
  });
});

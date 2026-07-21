import { describe, it, expect } from 'vitest';
import { hostEhPermitido, tokenConfere, caminhoEstaConfinado } from '../../src/server/guards.ts';

describe('DNS rebinding — validacao do header Host', () => {
  const PORTA = 47821;

  it.each(['127.0.0.1:47821', 'localhost:47821', '[::1]:47821', 'LOCALHOST:47821'])(
    'aceita %s',
    (host) => {
      expect(hostEhPermitido(host, PORTA)).toBe(true);
    },
  );

  const hostis = [
    // Dominio do atacante apontando para loopback — o ataque classico.
    'evil.example:47821',
    'rebind.attacker.com:47821',
    // Loopback na porta errada.
    '127.0.0.1:9999',
    // Endereco de rede: o app nunca deve responder fora da maquina.
    '192.168.1.10:47821',
    '0.0.0.0:47821',
    // Sem porta.
    '127.0.0.1',
    'localhost',
    // Truques de prefixo/sufixo.
    '127.0.0.1:47821.evil.com',
    'notlocalhost:47821',
    'localhost:47821:evil',
  ];

  it.each(hostis)('rejeita %s', (host) => {
    expect(hostEhPermitido(host, PORTA)).toBe(false);
  });

  it('rejeita Host ausente', () => {
    expect(hostEhPermitido(undefined, PORTA)).toBe(false);
  });
});

describe('token de sessao', () => {
  const TOKEN = 'a'.repeat(43);

  it('aceita o token correto', () => {
    expect(tokenConfere(TOKEN, TOKEN)).toBe(true);
  });

  it('rejeita token errado do mesmo tamanho', () => {
    expect(tokenConfere('b'.repeat(43), TOKEN)).toBe(false);
  });

  it('rejeita token de tamanho diferente sem estourar', () => {
    expect(tokenConfere('curto', TOKEN)).toBe(false);
    expect(tokenConfere('a'.repeat(100), TOKEN)).toBe(false);
  });

  it('rejeita token ausente — CSRF local depende disso', () => {
    expect(tokenConfere(undefined, TOKEN)).toBe(false);
    expect(tokenConfere('', TOKEN)).toBe(false);
  });

  it('rejeita prefixo do token correto', () => {
    expect(tokenConfere(TOKEN.slice(0, 20), TOKEN)).toBe(false);
  });
});

describe('path traversal no destino', () => {
  const RAIZ = 'C:/Users/Pedro/Downloads';

  it('aceita a propria raiz', () => {
    expect(caminhoEstaConfinado(RAIZ, RAIZ)).toBe(true);
  });

  it('aceita subdiretorio', () => {
    expect(caminhoEstaConfinado('C:/Users/Pedro/Downloads/videos', RAIZ)).toBe(true);
  });

  it('aceita separador do Windows', () => {
    expect(caminhoEstaConfinado('C:\\Users\\Pedro\\Downloads\\a.mp4', RAIZ)).toBe(true);
  });

  const escapes = [
    'C:/Windows/System32',
    'C:/Users/Pedro',
    // Irmao com prefixo comum: o caso que um `startsWith` cru deixaria passar.
    'C:/Users/Pedro/Downloads-secreto',
    'C:/Users/Pedro/DownloadsOutro/a.mp4',
  ];

  it.each(escapes)('rejeita %s', (alvo) => {
    expect(caminhoEstaConfinado(alvo, RAIZ)).toBe(false);
  });
});

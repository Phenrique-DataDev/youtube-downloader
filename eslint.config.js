import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', '.claude/**', 'site/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // O nucleo fala com subprocessos: proibir shell e concatenacao de comando
      // e responsabilidade do design, mas erros silenciosos de promise nao.
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Scripts de manutencao rodam no Node como JS puro. Os .ts do app nao
    // precisam disto: o typescript-eslint desliga `no-undef` em TS, porque o
    // proprio compilador ja resolve os globais via @types/node.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  {
    // A UI roda no browser, nao no Node — os globais sao outros.
    files: ['src/ui/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        URLSearchParams: 'readonly',
        TextDecoderStream: 'readonly',
        EventSource: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
      },
    },
  },
  prettier,
);

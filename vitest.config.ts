import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Rede + binarios externos: lento e sujeito a AT-008. Nunca no CI de PR.
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});

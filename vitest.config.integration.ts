import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/integration/**/*.integration.spec.ts'],
    setupFiles: ['./test/integration/setup/integration-test.setup.ts'],
    fileParallelism: false,
  },
});

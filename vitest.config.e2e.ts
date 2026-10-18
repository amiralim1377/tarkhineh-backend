import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/app.e2e-spec.ts', 'test/e2e/**/*.e2e-spec.ts'],
    exclude: ['test/integration/**'],
    fileParallelism: false,
  },
});

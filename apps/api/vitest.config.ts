import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'file:./test.db',
    },
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
  },
});

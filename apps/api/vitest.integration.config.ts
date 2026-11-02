import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { config } from 'dotenv';

config({ path: '../../.env', quiet: true });

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.int-spec.ts'],
    fileParallelism: false,
    pool: 'forks',
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});

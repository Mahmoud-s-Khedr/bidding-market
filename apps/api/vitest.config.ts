import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', '**/*.module.ts', 'src/generated/**'],
    },
  },
});

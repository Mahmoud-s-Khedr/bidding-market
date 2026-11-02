import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config({ path: '../../.env' });
export default defineConfig({ test: { include: ['test/**/*.int-spec.ts'] } });

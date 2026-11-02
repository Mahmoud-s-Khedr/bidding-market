import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Local dev: load the repo-root .env if present. In CI the variables come from the environment.
config({ path: '../../.env', quiet: true });

// `prisma generate` never connects to a database, so it must work without DATABASE_URL
// (typecheck/build/unit-test jobs have no DB). Commands that do connect fail loudly on the placeholder.
const PLACEHOLDER_URL = 'postgresql://unset:unset@127.0.0.1:1/unset';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: {
    url: process.env.DATABASE_URL ?? PLACEHOLDER_URL,
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});

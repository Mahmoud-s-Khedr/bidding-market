import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const envPath = path.resolve(repoRoot, '.env');

if (!process.env.WEB_PORT && fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Ignore if already loaded or unreadable
  }
}

const port = process.env.WEB_PORT || '3000';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter web start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    cwd: repoRoot,
    env: {
      ...process.env,
      WEB_PORT: port,
      PORT: port,
    },
  },
});

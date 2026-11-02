import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const webRoot = path.resolve(import.meta.dirname, '..');
const envPath = path.resolve(repoRoot, '.env');

if (!process.env.WEB_PORT && fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Ignore if unreadable
  }
}

const action = process.argv[2] ?? 'dev';
const port = process.env.WEB_PORT || '3000';

const require = createRequire(path.resolve(webRoot, 'package.json'));
const nextBin = require.resolve('next/dist/bin/next');

const child = spawn(process.execPath, [nextBin, action, '-p', port], {
  cwd: webRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: port,
    WEB_PORT: port,
  },
});

process.on('SIGINT', () => {
  if (child.pid) {
    child.kill('SIGINT');
  }
});

process.on('SIGTERM', () => {
  if (child.pid) {
    child.kill('SIGTERM');
  }
});

process.on('SIGHUP', () => {
  if (child.pid) {
    child.kill('SIGHUP');
  }
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

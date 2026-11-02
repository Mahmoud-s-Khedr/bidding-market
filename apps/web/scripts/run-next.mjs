import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
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

const child = spawn('next', [action, '-p', port], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    PORT: port,
    WEB_PORT: port,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

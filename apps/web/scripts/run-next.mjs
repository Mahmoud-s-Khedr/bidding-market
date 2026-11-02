import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadRootEnv } from '../src/lib/load-env.ts';

const webRoot = path.resolve(import.meta.dirname, '..');

// Load repo-root .env variables if not already present in process.env (CI takes precedence)
loadRootEnv();

const action = process.argv[2] ?? 'dev';
const port = process.env.WEB_PORT || '3000';

const require = createRequire(path.resolve(webRoot, 'package.json'));
const nextBin = require.resolve('next/dist/bin/next');

const nextArgs = [nextBin, action];
if (action === 'dev' || action === 'start') {
  nextArgs.push('-p', port);
}
nextArgs.push(...process.argv.slice(3));

const child = spawn(process.execPath, nextArgs, {
  cwd: webRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    ...(action === 'dev' || action === 'start' ? { PORT: port, WEB_PORT: port } : {}),
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

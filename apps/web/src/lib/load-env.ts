import fs from 'node:fs';
import path from 'node:path';

/**
 * Finds the repository root by searching upward from startDir for pnpm-workspace.yaml or .git.
 */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (
      fs.existsSync(path.join(curr, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(curr, '.git'))
    ) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) {
      break;
    }
    curr = parent;
  }
  return startDir;
}

/**
 * Parses a simple .env file content string into key-value pairs.
 * Supports comments (#), empty lines, quoted values ("...", '...'),
 * and trimming whitespace.
 */
export function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      continue;
    }

    let key = line.slice(0, eqIdx).trim();
    if (key.startsWith('export ')) {
      key = key.slice(7).trim();
    }

    let val = line.slice(eqIdx + 1).trim();

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
      if (rawLine.includes('"')) {
        val = val.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"');
      }
    }

    result[key] = val;
  }

  return result;
}

export interface LoadEnvOptions {
  envPath?: string;
  targetEnv?: Record<string, string | undefined>;
}

/**
 * Loads environment variables from the given file (or repo root .env by default)
 * into targetEnv (defaults to process.env).
 *
 * Existing variables in targetEnv (such as in CI) ALWAYS take precedence and are NOT overwritten.
 * If the file does not exist, it safely does nothing and returns an empty record.
 */
export function loadRootEnv(options: LoadEnvOptions = {}): Record<string, string> {
  const target = options.targetEnv ?? process.env;
  const envPath = options.envPath ?? path.join(findRepoRoot(), '.env');

  if (!fs.existsSync(envPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const parsed = parseEnv(content);
    const loaded: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (target[key] === undefined) {
        target[key] = value;
        loaded[key] = value;
      }
    }

    return loaded;
  } catch {
    return {};
  }
}

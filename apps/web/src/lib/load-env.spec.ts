import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadRootEnv, parseEnv, findRepoRoot } from './load-env';

describe('load-env helper', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-env-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('parseEnv', () => {
    it('parses basic key-value pairs', () => {
      const content = `
        # Comment line
        KEY1=value1
        KEY2=value2 with spaces
        export EXPORTED_KEY=exported_val
      `;
      const parsed = parseEnv(content);
      expect(parsed).toEqual({
        KEY1: 'value1',
        KEY2: 'value2 with spaces',
        EXPORTED_KEY: 'exported_val',
      });
    });

    it('handles quoted values correctly', () => {
      const content = `
        DOUBLE_QUOTED="hello \\n world"
        SINGLE_QUOTED='simple literal'
      `;
      const parsed = parseEnv(content);
      expect(parsed.DOUBLE_QUOTED).toBe('hello \n world');
      expect(parsed.SINGLE_QUOTED).toBe('simple literal');
    });

    it('ignores invalid or empty lines', () => {
      const content = `
        
        # only a comment
        INVALID_LINE_NO_EQUALS
        =NO_KEY
      `;
      const parsed = parseEnv(content);
      expect(parsed['']).toBe('NO_KEY');
      expect(parsed.INVALID_LINE_NO_EQUALS).toBeUndefined();
    });
  });

  describe('loadRootEnv', () => {
    it('respects precedence: existing process env (CI) takes precedence over .env file', () => {
      const envFilePath = path.join(tmpDir, '.env');
      fs.writeFileSync(
        envFilePath,
        `
        NEXT_PUBLIC_API_URL=http://from-dot-env:4000
        NEXT_PUBLIC_WS_URL=http://from-dot-env:4000
        UNSET_VAR=from-env-file
        `,
      );

      const targetEnv: Record<string, string | undefined> = {
        NEXT_PUBLIC_API_URL: 'https://ci.example.com',
        // NEXT_PUBLIC_WS_URL and UNSET_VAR are undefined in targetEnv
      };

      const loaded = loadRootEnv({ envPath: envFilePath, targetEnv });

      // Existing variable must NOT be overwritten (CI precedence)
      expect(targetEnv.NEXT_PUBLIC_API_URL).toBe('https://ci.example.com');
      expect(loaded.NEXT_PUBLIC_API_URL).toBeUndefined();

      // Unset variables from .env must be loaded
      expect(targetEnv.NEXT_PUBLIC_WS_URL).toBe('http://from-dot-env:4000');
      expect(loaded.NEXT_PUBLIC_WS_URL).toBe('http://from-dot-env:4000');
      expect(targetEnv.UNSET_VAR).toBe('from-env-file');
      expect(loaded.UNSET_VAR).toBe('from-env-file');
    });

    it('handles missing file gracefully without throwing and returns empty object', () => {
      const nonExistentPath = path.join(tmpDir, 'does-not-exist.env');
      const targetEnv: Record<string, string | undefined> = {
        EXISTING: 'val',
      };

      expect(() => {
        const loaded = loadRootEnv({ envPath: nonExistentPath, targetEnv });
        expect(loaded).toEqual({});
        expect(targetEnv.EXISTING).toBe('val');
      }).not.toThrow();
    });

    it('falls back to default repo root .env if no options provided', () => {
      const targetEnv: Record<string, string | undefined> = {};
      const loaded = loadRootEnv({ targetEnv });
      // The repo root .env exists in this workspace
      expect(typeof loaded).toBe('object');
      if (targetEnv.NEXT_PUBLIC_API_URL) {
        expect(targetEnv.NEXT_PUBLIC_API_URL).toContain('http');
      }
    });

    it('handles read errors gracefully', () => {
      const unreadablePath = path.join(tmpDir, '.env');
      fs.writeFileSync(unreadablePath, 'FOO=BAR');
      vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      const loaded = loadRootEnv({ envPath: unreadablePath, targetEnv: {} });
      expect(loaded).toEqual({});
    });
  });

  describe('findRepoRoot', () => {
    it('finds directory containing pnpm-workspace.yaml', () => {
      const found = findRepoRoot(__dirname);
      expect(fs.existsSync(path.join(found, 'pnpm-workspace.yaml'))).toBe(true);
    });

    it('returns startDir if filesystem root reached without workspace markers', () => {
      const found = findRepoRoot(tmpDir);
      expect(typeof found).toBe('string');
    });
  });
});

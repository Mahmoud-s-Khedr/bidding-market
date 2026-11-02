import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/common/env.js';
describe('health integration environment', () => {
  it('has dependency configuration', () => {
    expect(parseEnv(process.env).REDIS_URL).toMatch(/^redis:/);
  });
});

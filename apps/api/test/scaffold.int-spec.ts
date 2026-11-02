import { describe, expect, it } from 'vitest';

describe('integration scaffold', () => {
  it('has a configured database URL', () => {
    expect(process.env.DATABASE_URL).toBeTypeOf('string');
  });
});

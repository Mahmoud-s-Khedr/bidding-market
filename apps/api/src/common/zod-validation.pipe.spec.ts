import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';
describe('ZodValidationPipe', () => {
  it('returns parsed data', () =>
    expect(
      new ZodValidationPipe(z.object({ n: z.coerce.number() })).transform(
        { n: '2' },
        { type: 'body' },
      ),
    ).toEqual({ n: 2 }));
  it('throws for invalid input', () =>
    expect(() =>
      new ZodValidationPipe(z.object({ n: z.number() })).transform({ n: 'no' }, { type: 'body' }),
    ).toThrow());
});

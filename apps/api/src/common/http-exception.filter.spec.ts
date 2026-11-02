import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter.js';
describe('HttpExceptionFilter', () => {
  it('formats validation errors', () => {
    let body: unknown;
    const response = {
      status: () => ({
        json: (value: unknown) => {
          body = value;
        },
      }),
    };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    new HttpExceptionFilter().catch(new BadRequestException('bad'), host as never);
    expect(body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'bad' } });
  });
});

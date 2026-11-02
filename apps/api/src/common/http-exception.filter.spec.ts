import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ZodError } from 'zod';
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
describe('HttpExceptionFilter failures', () => {
  const call = (error: unknown) => {
    let body: unknown;
    const response = {
      status: () => ({
        json: (value: unknown) => {
          body = value;
        },
      }),
    };
    new HttpExceptionFilter().catch(error, {
      switchToHttp: () => ({ getResponse: () => response }),
    } as never);
    return body;
  };
  it('hides unknown errors', () =>
    expect(call(new Error('secret'))).toEqual({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    }));
  it('maps zod errors', () =>
    expect(call(new ZodError([]))).toMatchObject({ error: { code: 'VALIDATION_ERROR' } }));
  it('maps forbidden and missing status', () => {
    expect(call(new ForbiddenException('no'))).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(call(new NotFoundException('missing'))).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(call(new ConflictException('conflict'))).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(call(new HttpException('slow', 429))).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
  });
});

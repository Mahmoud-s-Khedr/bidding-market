import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { ZodError } from 'zod';
import type { Response } from 'express';
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = 'Internal server error';
    let details: unknown;
    if (exception instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Validation failed';
      details = exception.flatten();
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = 409;
        code = 'CONFLICT';
        message = 'Resource already exists';
      }
      if (exception.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        message = 'Resource not found';
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const object =
        typeof body === 'object' && body !== null
          ? (body as { message?: unknown; details?: unknown })
          : {};
      message =
        typeof object.message === 'string'
          ? object.message
          : (HttpStatus[status] ?? 'Request failed');
      details = object.details;
      const numericStatus = Number(status);
      code =
        numericStatus === 400
          ? 'VALIDATION_ERROR'
          : numericStatus === 401
            ? 'UNAUTHORIZED'
            : numericStatus === 403
              ? 'FORBIDDEN'
              : numericStatus === 404
                ? 'NOT_FOUND'
                : numericStatus === 409
                  ? 'CONFLICT'
                  : numericStatus === 429
                    ? 'RATE_LIMITED'
                    : 'INTERNAL';
    }
    response
      .status(status)
      .json({ error: { code, message, ...(details === undefined ? {} : { details }) } });
  }
}

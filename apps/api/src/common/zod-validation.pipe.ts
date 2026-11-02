import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema?: ZodType) {}
  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    if (!this.schema) return value;
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new BadRequestException({
        message: 'Validation failed',
        details: result.error.flatten(),
      });
    return result.data;
  }
}

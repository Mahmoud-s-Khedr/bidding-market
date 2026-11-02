import {
  loginSchema,
  registerSchema as sharedRegisterSchema,
  passwordSchema,
  type LoginInput,
  type RegisterInput,
} from '@market/shared';
import { z } from 'zod';

export { loginSchema, passwordSchema, type LoginInput, type RegisterInput };

export const registerSchema = z
  .object({
    ...sharedRegisterSchema.shape,
    companyName: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
  })
  .refine((v) => !v.isBusiness || (typeof v.companyName === 'string' && v.companyName.length > 0), {
    message: 'companyName is required for businesses',
    path: ['companyName'],
  });

export type RegisterFormInput = z.input<typeof registerSchema>;

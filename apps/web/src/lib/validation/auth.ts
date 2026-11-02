import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    email: z.string().trim().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    displayName: z.string().trim().min(2, 'Display name must be at least 2 characters'),
    isBusiness: z.boolean().default(false),
    companyName: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isBusiness && (!data.companyName || data.companyName.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Company name is required for business accounts',
        path: ['companyName'],
      });
    }
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type RegisterFormInput = z.input<typeof registerSchema>;

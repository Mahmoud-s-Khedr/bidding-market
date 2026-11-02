'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { registerSchema, type RegisterInput } from '@/lib/validation/auth';
import { useAuth } from './auth-provider';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { AlertCircle, Building2 } from 'lucide-react';

export function RegisterForm() {
  const { register: registerUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      displayName: '',
      isBusiness: false,
      companyName: '',
    },
  });

  const isBusiness = watch('isBusiness');

  const onSubmit = async (data: RegisterInput) => {
    setServerError(null);
    try {
      await registerUser(data);
      toast.success('Account created!', 'Welcome to the marketplace.');
      const next = searchParams?.get('next') || '/dashboard';
      router.push(next);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('Failed to create account. Please check your information and try again.');
      }
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold tracking-tight">Create an account</CardTitle>
        <CardDescription>
          Join the bidding marketplace to post requests, offer services, or place bids
        </CardDescription>
      </CardHeader>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(onSubmit)(e);
        }}
        noValidate
      >
        <CardContent className="space-y-4">
          {serverError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <FormField
            id="register-name"
            label="Display Name"
            error={errors.displayName?.message}
            required
          >
            <Input
              type="text"
              autoComplete="name"
              placeholder="Alex Smith"
              {...register('displayName')}
            />
          </FormField>

          <FormField
            id="register-email"
            label="Email address"
            error={errors.email?.message}
            required
          >
            <Input
              type="email"
              autoComplete="email"
              placeholder="alex@example.com"
              {...register('email')}
            />
          </FormField>

          <FormField
            id="register-password"
            label="Password"
            hint="Minimum 8 characters"
            error={errors.password?.message}
            required
          >
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              {...register('password')}
            />
          </FormField>

          <div className="rounded-lg border border-border p-3.5 space-y-3 bg-muted/40">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring focus:ring-offset-1"
                {...register('isBusiness')}
              />
              <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                I&apos;m registering as a business
              </span>
            </label>

            {isBusiness && (
              <FormField
                id="register-company"
                label="Company Name"
                error={errors.companyName?.message}
                required
              >
                <Input type="text" placeholder="Acme Corp LLC" {...register('companyName')} />
              </FormField>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            className="w-full"
            size="md"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            Create account
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

import * as React from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';
import { Spinner } from '@/components/ui/spinner';

export const metadata: Metadata = {
  title: 'Sign In — BidMarket',
  description: 'Sign in to your BidMarket account to manage bids and listings.',
};

export default function LoginPage() {
  return (
    <div className="container mx-auto flex flex-1 items-center justify-center px-4 py-12">
      <React.Suspense
        fallback={
          <div className="flex justify-center p-8">
            <Spinner size="lg" label="Loading..." />
          </div>
        }
      >
        <LoginForm />
      </React.Suspense>
    </div>
  );
}

import * as React from 'react';
import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/register-form';
import { Spinner } from '@/components/ui/spinner';

export const metadata: Metadata = {
  title: 'Create an Account — BidMarket',
  description: 'Join BidMarket as an individual or business to post listings and submit bids.',
};

export default function RegisterPage() {
  return (
    <div className="container mx-auto flex flex-1 items-center justify-center px-4 py-12">
      <React.Suspense
        fallback={
          <div className="flex justify-center p-8">
            <Spinner size="lg" label="Loading..." />
          </div>
        }
      >
        <RegisterForm />
      </React.Suspense>
    </div>
  );
}

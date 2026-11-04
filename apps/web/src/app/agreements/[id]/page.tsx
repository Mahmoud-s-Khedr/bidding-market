'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FileCheck, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { RequireAuth } from '@/components/auth/require-auth';

function AgreementDetailPageContent() {
  const params = useParams();
  const id = (params?.id as string) || '';

  return (
    <RequireAuth>
      <div className="container mx-auto px-4 py-16 sm:px-6 max-w-2xl text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
          <FileCheck className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Agreement Created</h1>
          <p className="text-sm text-muted-foreground">
            Agreement ID: <span className="font-mono font-medium text-foreground">{id}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            The full milestone tracking, deliverables, confirmations, and dispute workflow will be
            implemented in task WEB-05.
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-4">
          <Button variant="outline" asChild>
            <Link href="/listings">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Browse
            </Link>
          </Button>
          <Button asChild>
            <Link href="/bids">Go to My Bids</Link>
          </Button>
        </div>
      </div>
    </RequireAuth>
  );
}

export default function AgreementDetailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading..." />
        </div>
      }
    >
      <AgreementDetailPageContent />
    </React.Suspense>
  );
}

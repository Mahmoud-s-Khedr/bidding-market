'use client';

import * as React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/api/query-client';
import { AuthProvider } from './auth/auth-provider';
import { RealtimeProvider } from '@/lib/realtime';
import { ToastProvider } from './ui/toast';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeProvider>
          <ToastProvider>{children}</ToastProvider>
        </RealtimeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

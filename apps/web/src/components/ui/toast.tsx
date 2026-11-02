'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'default' | 'success' | 'error' | 'info';

export interface ToastData {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toasts: ToastData[];
  toast: (options: Omit<ToastData, 'id'>) => string;
  dismiss: (id: string) => void;
  success: (title: React.ReactNode, description?: React.ReactNode) => string;
  error: (title: React.ReactNode, description?: React.ReactNode) => string;
  info: (title: React.ReactNode, description?: React.ReactNode) => string;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

let externalToast: ToastContextValue['toast'] | null = null;
let externalSuccess: ToastContextValue['success'] | null = null;
let externalError: ToastContextValue['error'] | null = null;
let externalInfo: ToastContextValue['info'] | null = null;

export const toast = {
  custom: (options: Omit<ToastData, 'id'>) => externalToast?.(options) ?? '',
  success: (title: React.ReactNode, description?: React.ReactNode) =>
    externalSuccess?.(title, description) ?? '',
  error: (title: React.ReactNode, description?: React.ReactNode) =>
    externalError?.(title, description) ?? '',
  info: (title: React.ReactNode, description?: React.ReactNode) =>
    externalInfo?.(title, description) ?? '',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastData[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = React.useCallback((options: Omit<ToastData, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastData = { id, ...options };
    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  const success = React.useCallback(
    (title: React.ReactNode, description?: React.ReactNode) =>
      addToast({ title, description, variant: 'success' }),
    [addToast],
  );

  const error = React.useCallback(
    (title: React.ReactNode, description?: React.ReactNode) =>
      addToast({ title, description, variant: 'error' }),
    [addToast],
  );

  const info = React.useCallback(
    (title: React.ReactNode, description?: React.ReactNode) =>
      addToast({ title, description, variant: 'info' }),
    [addToast],
  );

  React.useEffect(() => {
    externalToast = addToast;
    externalSuccess = success;
    externalError = error;
    externalInfo = info;
    return () => {
      externalToast = null;
      externalSuccess = null;
      externalError = null;
      externalInfo = null;
    };
  }, [addToast, success, error, info]);

  return (
    <ToastContext.Provider value={{ toasts, toast: addToast, dismiss, success, error, info }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((item) => (
          <ToastItem key={item.id} data={item} onDismiss={() => dismiss(item.id)} />
        ))}
        <ToastPrimitive.Viewport className="fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

function ToastItem({ data, onDismiss }: { data: ToastData; onDismiss: () => void }) {
  const variantIcons = {
    default: null,
    success: <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />,
    error: <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />,
    info: <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />,
  };

  const variantStyles: Record<ToastVariant, string> = {
    default: 'border-border bg-card text-card-foreground',
    success:
      'border-emerald-500/30 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100',
    error:
      'border-destructive/30 bg-destructive/10 text-destructive-foreground dark:bg-destructive/20',
    info: 'border-primary/30 bg-primary/10 text-primary-foreground dark:bg-primary/20',
  };

  const variant = data.variant || 'default';

  return (
    <ToastPrimitive.Root
      duration={data.duration || 5000}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
      className={cn(
        'group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 shadow-lg transition-all',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full sm:data-[state=open]:slide-in-from-bottom-full',
        variantStyles[variant],
      )}
    >
      {variantIcons[variant]}
      <div className="flex-1 grid gap-1">
        {data.title && (
          <ToastPrimitive.Title className="text-sm font-semibold leading-tight">
            {data.title}
          </ToastPrimitive.Title>
        )}
        {data.description && (
          <ToastPrimitive.Description className="text-xs opacity-90 leading-normal">
            {data.description}
          </ToastPrimitive.Description>
        )}
      </div>
      <ToastPrimitive.Close
        className="rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Close notification"
      >
        <X className="h-4 w-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

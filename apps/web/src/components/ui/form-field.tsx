import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

export interface FormFieldRenderProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  error?: boolean;
}

export interface FormFieldProps {
  id?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children:
    React.ReactElement<FormFieldRenderProps> | ((props: FormFieldRenderProps) => React.ReactNode);
}

export function FormField({
  id: providedId,
  label,
  hint,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  const generatedId = React.useId();
  const id = providedId || generatedId;

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const fieldProps: FormFieldRenderProps = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? 'true' : undefined,
    error: !!error,
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}

      {typeof children === 'function'
        ? children(fieldProps)
        : React.isValidElement(children)
          ? React.cloneElement(children, fieldProps)
          : children}

      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

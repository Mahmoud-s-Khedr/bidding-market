import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

export interface LabelProps extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  required?: boolean;
}

export const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        'text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1',
        className,
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="text-destructive font-bold text-xs" aria-hidden="true">
          *
        </span>
      )}
    </LabelPrimitive.Root>
  ),
);

Label.displayName = LabelPrimitive.Root.displayName;

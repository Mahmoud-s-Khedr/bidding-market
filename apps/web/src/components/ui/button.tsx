import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  asChild?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary-hover shadow-xs active:scale-[0.99]',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-secondary-hover shadow-xs border border-border',
  ghost: 'bg-transparent text-foreground hover:bg-secondary',
  destructive:
    'bg-destructive text-destructive-foreground hover:bg-destructive-hover shadow-xs active:scale-[0.99]',
  outline: 'border border-border bg-transparent text-foreground hover:bg-secondary shadow-xs',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md font-medium',
  md: 'h-9.5 px-4 text-sm gap-2 rounded-md font-medium',
  lg: 'h-11 px-6 text-base gap-2.5 rounded-lg font-semibold',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      asChild = false,
      children,
      type = 'button',
      onClick,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const isDisabled = disabled || isLoading;

    // For asChild, custom elements like <a> cannot be disabled natively;
    // guard the onClick callback when disabled or loading.
    const handleClick = onClick
      ? (e: React.MouseEvent<HTMLButtonElement>) => {
          if (isDisabled) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          onClick(e);
        }
      : undefined;

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        disabled={asChild ? undefined : isDisabled}
        aria-busy={isLoading ? 'true' : undefined}
        aria-disabled={isDisabled ? 'true' : undefined}
        tabIndex={asChild && isDisabled ? -1 : props.tabIndex}
        onClick={handleClick}
        className={cn(
          'inline-flex items-center justify-center transition-colors select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          asChild && isDisabled && 'pointer-events-none opacity-50',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {!asChild && isLoading ? (
          <>
            <Spinner
              size={size === 'sm' ? 'xs' : size === 'lg' ? 'md' : 'sm'}
              className="text-current"
            />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);

Button.displayName = 'Button';

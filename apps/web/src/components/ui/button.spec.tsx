import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('Button component', () => {
  it('renders with default props', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-primary');
  });

  it('renders all variants correctly', () => {
    const { rerender } = render(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-secondary');

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-transparent');

    rerender(<Button variant="destructive">Destructive</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-destructive');

    rerender(<Button variant="outline">Outline</Button>);
    expect(screen.getByRole('button')).toHaveClass('border-border');
  });

  it('renders all sizes correctly', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-8');

    rerender(<Button size="md">Medium</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-9.5');

    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-11');
  });

  it('renders loading state with spinner and disables button', () => {
    render(<Button isLoading>Submit</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Submit')).toBeInTheDocument();
  });

  it('handles click events when not disabled', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={handleClick}>Click</Button>);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire click events when disabled or loading', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>,
    );

    await user.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();

    rerender(
      <Button isLoading onClick={handleClick}>
        Loading
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('supports asChild rendering', () => {
    render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: /link button/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/test');
    expect(link).toHaveClass('bg-primary');
  });

  it('handles asChild combined with isLoading without crashing Slot or throwing React.Children.only', () => {
    expect(() =>
      render(
        <Button asChild isLoading>
          <a href="/dashboard">Loading Link</a>
        </Button>,
      ),
    ).not.toThrow();

    const link = screen.getByRole('link', { name: /loading link/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('aria-busy', 'true');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).toHaveAttribute('tabindex', '-1');
    expect(link).toHaveClass('pointer-events-none');
    // Spinner should not be rendered as a second child into Slot
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('handles asChild disabled behavior with tabIndex and click guard', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(
      <Button asChild disabled onClick={handleClick}>
        <a href="/somewhere">Disabled Link</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: /disabled link/i });
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).toHaveAttribute('tabindex', '-1');
    expect(link).not.toHaveAttribute('disabled'); // <a> does not support disabled attribute

    await user.click(link);
    expect(handleClick).not.toHaveBeenCalled();
  });
});

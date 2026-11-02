import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Input,
  Textarea,
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectSeparator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ToastProvider,
  useToast,
  toast,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Skeleton,
  Spinner,
  EmptyState,
  ErrorState,
  Pagination,
  LoadMore,
} from './index';
import { Providers } from '../providers';
import { createQueryClient } from '@/lib/api/query-client';
import { ApiError } from '@/lib/api/client';

describe('UI Primitives and Design System', () => {
  it('renders Input with error styling and ref', () => {
    const ref = { current: null };
    render(<Input ref={ref} error placeholder="Enter name" />);
    const input = screen.getByPlaceholderText('Enter name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveClass('border-destructive');
    expect(ref.current).toBe(input);
  });

  it('renders Textarea with error styling and ref', () => {
    const ref = { current: null };
    render(<Textarea ref={ref} error placeholder="Enter description" />);
    const textarea = screen.getByPlaceholderText('Enter description');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveClass('border-destructive');
    expect(ref.current).toBe(textarea);
  });

  it('renders Label with required asterisk', () => {
    render(<Label required>Field Name</Label>);
    expect(screen.getByText('Field Name')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders Card components properly', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent>Content Area</CardContent>
        <CardFooter>Footer Area</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Card Title')).toBeInTheDocument();
    expect(screen.getByText('Card Description')).toBeInTheDocument();
    expect(screen.getByText('Content Area')).toBeInTheDocument();
    expect(screen.getByText('Footer Area')).toBeInTheDocument();
  });

  it('renders all Badge variants', () => {
    const { rerender } = render(<Badge variant="default">Default</Badge>);
    expect(screen.getByText('Default')).toHaveClass('bg-primary');

    rerender(<Badge variant="secondary">Secondary</Badge>);
    expect(screen.getByText('Secondary')).toHaveClass('bg-secondary');

    rerender(<Badge variant="success">Success</Badge>);
    expect(screen.getByText('Success')).toHaveClass('bg-emerald-100');

    rerender(<Badge variant="warning">Warning</Badge>);
    expect(screen.getByText('Warning')).toHaveClass('bg-amber-100');

    rerender(<Badge variant="destructive">Destructive</Badge>);
    expect(screen.getByText('Destructive')).toHaveClass('bg-destructive');

    rerender(<Badge variant="outline">Outline</Badge>);
    expect(screen.getByText('Outline')).toHaveClass('border-border');
  });

  it('renders Dialog modal and triggers content', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open Modal</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modal Title</DialogTitle>
            <DialogDescription>Modal Description</DialogDescription>
          </DialogHeader>
          <div>Dialog Body</div>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByText('Modal Title')).not.toBeInTheDocument();

    await user.click(screen.getByText('Open Modal'));

    expect(screen.getByText('Modal Title')).toBeInTheDocument();
    expect(screen.getByText('Dialog Body')).toBeInTheDocument();
  });

  it('renders DialogFooter properly', () => {
    render(
      <DialogFooter className="custom-footer">
        <span>Footer Content</span>
      </DialogFooter>,
    );
    expect(screen.getByText('Footer Content')).toBeInTheDocument();
  });

  it('renders DropdownMenu components', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open Dropdown</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem>Item 1</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive>Item 2</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByText('Open Dropdown'));
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('renders Select primitives', () => {
    render(
      <Select defaultValue="val1">
        <SelectTrigger error>
          <SelectValue placeholder="Choose option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="val1">Option 1</SelectItem>
          <SelectSeparator />
          <SelectItem value="val2">Option 2</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByText('Option 1')).toBeInTheDocument();
  });

  it('renders Avatar with AvatarImage and AvatarFallback', () => {
    render(
      <Avatar>
        <AvatarImage src="/test.jpg" alt="Test User" />
        <AvatarFallback>TU</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText('TU')).toBeInTheDocument();
  });

  it('renders Providers wrapping children', () => {
    render(
      <Providers>
        <div data-testid="provider-child">App Ready</div>
      </Providers>,
    );
    expect(screen.getByTestId('provider-child')).toHaveTextContent('App Ready');
  });

  it('renders Tabs and toggles content', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>,
    );

    expect(screen.getByText('Content 1')).toBeInTheDocument();

    await user.click(screen.getByText('Tab 2'));

    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });

  it('renders Avatar with fallback text', () => {
    render(
      <Avatar>
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders Skeleton loading pulse placeholder', () => {
    render(<Skeleton className="h-4 w-32" data-testid="test-skeleton" />);
    expect(screen.getByTestId('test-skeleton')).toHaveClass('animate-pulse');
  });

  it('renders Spinner with different sizes', () => {
    const { rerender } = render(<Spinner size="xs" label="Loading mini" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading mini');

    rerender(<Spinner size="sm" />);
    rerender(<Spinner size="md" />);
    rerender(<Spinner size="lg" />);
  });

  it('renders EmptyState with title, description, and action button', () => {
    render(
      <EmptyState
        title="Empty List"
        description="There are no items here"
        action={<button>Add Item</button>}
      />,
    );
    expect(screen.getByText('Empty List')).toBeInTheDocument();
    expect(screen.getByText('There are no items here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
  });

  it('renders ErrorState with retry button', async () => {
    const handleRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <ErrorState
        title="Custom Error"
        message="Failure reason"
        onRetry={handleRetry}
        retryLabel="Try Again Now"
      />,
    );

    expect(screen.getByText('Custom Error')).toBeInTheDocument();
    expect(screen.getByText('Failure reason')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try Again Now' }));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders Pagination and handles page changes', async () => {
    const handlePageChange = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <Pagination page={2} totalPages={5} onPageChange={handlePageChange} />,
    );

    expect(screen.getByText(/page/i)).toHaveTextContent('Page 2 of 5');

    await user.click(screen.getByLabelText('Previous page'));
    expect(handlePageChange).toHaveBeenCalledWith(1);

    await user.click(screen.getByLabelText('Next page'));
    expect(handlePageChange).toHaveBeenCalledWith(3);

    // On page 1, previous is disabled
    rerender(<Pagination page={1} totalPages={5} onPageChange={handlePageChange} />);
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
  });

  it('renders LoadMore button when hasMore is true', async () => {
    const handleLoadMore = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<LoadMore hasMore={true} onLoadMore={handleLoadMore} />);

    const button = screen.getByRole('button', { name: 'Load more' });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(handleLoadMore).toHaveBeenCalledTimes(1);

    // When hasMore is false, component renders nothing
    rerender(<LoadMore hasMore={false} onLoadMore={handleLoadMore} />);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('manages toasts via ToastProvider, hooks, and helpers', async () => {
    function ToastTriggerComponent() {
      const { toast: hookToast, success, error, info } = useToast();
      return (
        <div>
          <button onClick={() => hookToast({ title: 'Custom Notice' })}>Show Custom</button>
          <button onClick={() => success('Success Title', 'Success Description')}>
            Show Success
          </button>
          <button onClick={() => error('Error Title', 'Error Description')}>Show Error</button>
          <button onClick={() => info('Info Title')}>Show Info</button>
        </div>
      );
    }

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastTriggerComponent />
      </ToastProvider>,
    );

    await user.click(screen.getByText('Show Success'));
    expect(screen.getByText('Success Title')).toBeInTheDocument();
    expect(screen.getByText('Success Description')).toBeInTheDocument();

    await user.click(screen.getByText('Show Error'));
    expect(screen.getByText('Error Title')).toBeInTheDocument();

    await user.click(screen.getByText('Show Info'));
    expect(screen.getByText('Info Title')).toBeInTheDocument();

    // Test external toast helper functions
    act(() => {
      toast.success('External Success');
      toast.error('External Error');
      toast.info('External Info');
      toast.custom({ title: 'External Custom' });
    });

    expect(screen.getByText('External Success')).toBeInTheDocument();
    expect(screen.getByText('External Error')).toBeInTheDocument();
    expect(screen.getByText('External Info')).toBeInTheDocument();
    expect(screen.getByText('External Custom')).toBeInTheDocument();
  });

  it('createQueryClient initializes sensible query defaults', () => {
    const client = createQueryClient();
    const defaultOptions = client.getDefaultOptions();
    expect(defaultOptions.queries?.staleTime).toBe(60000);

    const retryFn = defaultOptions.queries?.retry;
    if (typeof retryFn === 'function') {
      expect(retryFn(1, new ApiError(401, 'Unauthorized'))).toBe(false);
      expect(retryFn(1, new ApiError(403, 'Forbidden'))).toBe(false);
      expect(retryFn(1, new ApiError(404, 'Not found'))).toBe(false);
      expect(retryFn(1, new Error('Network error'))).toBe(true);
      expect(retryFn(2, new Error('Network error'))).toBe(false);
    }
  });
});

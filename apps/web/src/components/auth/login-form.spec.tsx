import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './login-form';
import { ApiError } from '@/lib/api/client';

const mockPush = vi.fn();
const mockGetParam = vi.fn();
const mockLogin = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockGetParam }),
}));

vi.mock('./auth-provider', () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('LoginForm component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetParam.mockReturnValue('/dashboard');
  });

  it('renders sign in form with inputs and submit button', () => {
    render(<LoginForm />);
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('displays client-side validation errors when submitting empty form', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('submits valid input, calls login, and redirects to next param', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce(undefined);
    mockGetParam.mockReturnValue('/listings/123');

    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email address/i), 'alice@market.test');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'alice@market.test',
        password: 'Password123!',
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/listings/123');
    });
  });

  it('displays server error message when login fails with ApiError', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new ApiError(401, 'Invalid email or password', 'UNAUTHORIZED'));

    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email address/i), 'wrong@market.test');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
});

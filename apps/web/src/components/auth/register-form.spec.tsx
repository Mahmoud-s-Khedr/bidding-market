import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterForm } from './register-form';
import { ApiError } from '@/lib/api/client';

const mockPush = vi.fn();
const mockGetParam = vi.fn();
const mockRegister = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockGetParam }),
}));

vi.mock('./auth-provider', () => ({
  useAuth: () => ({
    register: mockRegister,
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('RegisterForm component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetParam.mockReturnValue('/dashboard');
  });

  it('renders registration form with required fields', () => {
    render(<RegisterForm />);
    expect(screen.getByRole('heading', { name: /create an account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/i'm registering as a business/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('validates minimum password length and display name length', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/display name/i), 'A');
    await user.type(screen.getByLabelText(/email address/i), 'invalid-email');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/expected string to have >=2 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
      expect(screen.getByText(/expected string to have >=8 characters/i)).toBeInTheDocument();
    });

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('toggles company name when business checkbox is checked and validates it', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    // Initially company name input is not visible
    expect(screen.queryByLabelText(/company name/i)).not.toBeInTheDocument();

    // Check business checkbox
    await user.click(screen.getByLabelText(/i'm registering as a business/i));

    // Now company name input appears
    const companyInput = screen.getByLabelText(/company name/i);
    expect(companyInput).toBeInTheDocument();

    // Fill valid other fields but leave company name empty
    await user.type(screen.getByLabelText(/display name/i), 'Acme Manager');
    await user.type(screen.getByLabelText(/email address/i), 'acme@market.test');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/companyname is required for businesses/i)).toBeInTheDocument();
    });

    // Fill company name and submit
    await user.type(companyInput, 'Acme Innovations');
    mockRegister.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        displayName: 'Acme Manager',
        email: 'acme@market.test',
        password: 'Password123!',
        isBusiness: true,
        companyName: 'Acme Innovations',
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('displays server error when registration fails with ApiError', async () => {
    const user = userEvent.setup();
    mockRegister.mockRejectedValueOnce(
      new ApiError(409, 'Email is already registered', 'CONFLICT'),
    );

    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/display name/i), 'Test Person');
    await user.type(screen.getByLabelText(/email address/i), 'existing@market.test');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Email is already registered');
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('submits valid registration and redirects to benign next param', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValueOnce(undefined);
    mockGetParam.mockReturnValue('/listings/new');

    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/display name/i), 'New Seller');
    await user.type(screen.getByLabelText(/email address/i), 'seller@market.test');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/listings/new');
    });
  });

  it.each([['//evil.com'], ['https://evil.com'], ['/\\evil.com'], ['javascript:']])(
    'sanitizes malicious next param %s and redirects safely to /dashboard',
    async (maliciousNext) => {
      const user = userEvent.setup();
      mockRegister.mockResolvedValueOnce(undefined);
      mockGetParam.mockReturnValue(maliciousNext);

      render(<RegisterForm />);

      await user.type(screen.getByLabelText(/display name/i), 'New Seller');
      await user.type(screen.getByLabelText(/email address/i), 'seller@market.test');
      await user.type(screen.getByLabelText(/password/i), 'Password123!');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      });
    },
  );
});

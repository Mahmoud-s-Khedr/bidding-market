import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AgreementPage from './[id]/page';
import * as authContext from '@/components/auth/auth-provider';
import * as agreementsApi from '@/lib/api/agreements';
import * as usersApi from '@/lib/api/users';
import { ApiError } from '@/lib/api/client';
import {
  makeUser,
  makeAgreementDetail,
  makeMilestone,
  makeDeliverable,
  makeAgreementEvent,
  makeAttachment,
} from '../../../test/fixtures';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'agreement-123' }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/agreements/agreement-123',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api/agreements', () => ({
  useAgreement: vi.fn(),
  useCreateMilestone: vi.fn(),
  useUpdateMilestone: vi.fn(),
  useSubmitDeliverable: vi.fn(),
  useAcceptDeliverable: vi.fn(),
  useRequestRevision: vi.fn(),
  useCompleteAgreement: vi.fn(),
  useCancelAgreement: vi.fn(),
  useDisputeAgreement: vi.fn(),
  useSubmitReview: vi.fn(),
}));

vi.mock('@/lib/api/users', () => ({
  useUserReviews: vi.fn(),
}));

// Mock FileDropzone to simulate file selection directly
vi.mock('@/components/ui/file-dropzone', () => ({
  FileDropzone: ({
    value = [],
    onChange,
  }: {
    value?: Array<{ id: string; fileName: string }>;
    onChange?: (val: Array<{ id: string; fileName: string }>) => void;
  }) => (
    <div data-testid="mock-file-dropzone">
      <button
        type="button"
        onClick={() =>
          onChange?.([...value, { id: 'att-upload-1', fileName: 'sample-deliverable.pdf' }])
        }
      >
        Simulate Attach File
      </button>
      <span>Attached files: {value.length}</span>
    </div>
  ),
}));

describe('AgreementPage Component', () => {
  const mockRefetchAgreement = vi.fn();
  const mockCompleteMutate = vi.fn();
  const mockCancelMutate = vi.fn();
  const mockDisputeMutate = vi.fn();
  const mockCreateMsMutate = vi.fn();
  const mockUpdateMsMutate = vi.fn();
  const mockSubmitDelivMutate = vi.fn();
  const mockAcceptDelivMutate = vi.fn();
  const mockReqRevMutate = vi.fn();
  const mockReviewMutate = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: makeUser({ id: 'user-buyer', displayName: 'Buyer Alice' }),
      token: 'jwt-token',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.mocked(agreementsApi.useCompleteAgreement).mockReturnValue({
      mutateAsync: mockCompleteMutate,
      isPending: false,
    } as unknown as ReturnType<typeof agreementsApi.useCompleteAgreement>);

    vi.mocked(agreementsApi.useCancelAgreement).mockReturnValue({
      mutateAsync: mockCancelMutate,
      isPending: false,
    } as unknown as ReturnType<typeof agreementsApi.useCancelAgreement>);

    vi.mocked(agreementsApi.useDisputeAgreement).mockReturnValue({
      mutateAsync: mockDisputeMutate,
      isPending: false,
    } as unknown as ReturnType<typeof agreementsApi.useDisputeAgreement>);

    vi.mocked(agreementsApi.useCreateMilestone).mockReturnValue({
      mutateAsync: mockCreateMsMutate,
      isPending: false,
    } as unknown as ReturnType<typeof agreementsApi.useCreateMilestone>);

    vi.mocked(agreementsApi.useUpdateMilestone).mockReturnValue({
      mutateAsync: mockUpdateMsMutate,
      isPending: false,
    } as unknown as ReturnType<typeof agreementsApi.useUpdateMilestone>);

    vi.mocked(agreementsApi.useSubmitDeliverable).mockReturnValue({
      mutateAsync: mockSubmitDelivMutate,
      isPending: false,
    } as unknown as ReturnType<typeof agreementsApi.useSubmitDeliverable>);

    vi.mocked(agreementsApi.useAcceptDeliverable).mockReturnValue({
      mutateAsync: mockAcceptDelivMutate,
      isPending: false,
    } as unknown as ReturnType<typeof agreementsApi.useAcceptDeliverable>);

    vi.mocked(agreementsApi.useRequestRevision).mockReturnValue({
      mutateAsync: mockReqRevMutate,
      isPending: false,
    } as unknown as ReturnType<typeof agreementsApi.useRequestRevision>);

    vi.mocked(agreementsApi.useSubmitReview).mockReturnValue({
      mutateAsync: mockReviewMutate,
      isPending: false,
    } as unknown as ReturnType<typeof agreementsApi.useSubmitReview>);

    vi.mocked(usersApi.useUserReviews).mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }], pageParams: [null] },
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof usersApi.useUserReviews>);
  });

  it('renders loading spinner when loading', () => {
    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);
    expect(screen.getByTestId('agreement-loading-spinner')).toBeInTheDocument();
  });

  it('renders 404 Not Found error state when agreement is not found', () => {
    const error404 = new ApiError(404, 'Not found', 'NOT_FOUND');
    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: error404,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);
    expect(screen.getByText('Agreement Not Found')).toBeInTheDocument();
  });

  it('renders 403 Access Restricted error state for unauthorized users', () => {
    const error403 = new ApiError(403, 'Forbidden', 'FORBIDDEN');
    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: error403,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);
    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
  });

  it('renders generic error state with retry on network failure', () => {
    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);
    expect(screen.getByText('Failed to load agreement')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryBtn);
    expect(mockRefetchAgreement).toHaveBeenCalled();
  });

  it('renders agreement header, parties, agreed price, and conversation link', () => {
    const agreement = makeAgreementDetail({
      id: 'ag-1',
      status: 'ACTIVE',
      myRole: 'buyer',
      conversationId: 'conv-100',
    });

    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: agreement,
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);

    expect(screen.getByText(/Agreement #ag-1/i)).toBeInTheDocument();
    expect(screen.getByText('$200')).toBeInTheDocument();
    expect(screen.getByText('Chat with counterpart')).toBeInTheDocument();
  });

  it('shows buyer actions and hides provider-only actions when viewing as Buyer', () => {
    const deliverable = makeDeliverable({
      id: 'd1',
      note: 'First delivery draft',
      acceptedAt: null,
      revisionNote: null,
      attachments: [
        makeAttachment({
          id: 'att-img-1',
          fileName: 'preview.png',
          mimeType: 'image/png',
          url: 'https://cdn.example.com/preview.png',
        }),
        makeAttachment({
          id: 'att-doc-1',
          fileName: 'code.zip',
          mimeType: 'application/zip',
          url: 'https://cdn.example.com/code.zip',
        }),
      ],
    });

    const agreement = makeAgreementDetail({
      myRole: 'buyer',
      status: 'ACTIVE',
      deliverables: [deliverable],
    });

    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: agreement,
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);

    // Buyer sees Accept and Request Revision buttons
    expect(screen.getByRole('button', { name: /accept deliverable/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request revision/i })).toBeInTheDocument();

    // Buyer does NOT see "Submit Work / Deliverable" form
    expect(screen.queryByText('Submit Work / Deliverable')).not.toBeInTheDocument();

    // Image rendered as thumbnail, zip as link
    expect(screen.getByAltText('preview.png')).toBeInTheDocument();
    expect(screen.getByText('code.zip')).toBeInTheDocument();
  });

  it('shows provider submission form and hides buyer actions when viewing as Provider', () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: makeUser({ id: 'user-provider', displayName: 'Bob Provider' }),
      token: 'jwt-token',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    const deliverable = makeDeliverable({
      id: 'd1',
      acceptedAt: null,
    });

    const agreement = makeAgreementDetail({
      myRole: 'provider',
      status: 'ACTIVE',
      deliverables: [deliverable],
    });

    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: agreement,
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);

    // Provider sees "Submit Work / Deliverable" form
    expect(screen.getByText('Submit Work / Deliverable')).toBeInTheDocument();

    // Provider does NOT see Accept or Request Revision buttons
    expect(screen.queryByRole('button', { name: /accept deliverable/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /request revision/i })).not.toBeInTheDocument();
  });

  it('submits a deliverable with note and attachments when Provider submits', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: makeUser({ id: 'user-provider', displayName: 'Bob Provider' }),
      token: 'jwt-token',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    const agreement = makeAgreementDetail({
      myRole: 'provider',
      status: 'ACTIVE',
      deliverables: [],
    });

    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: agreement,
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);

    const noteInput = screen.getByLabelText(/delivery note/i);
    fireEvent.change(noteInput, { target: { value: 'Here is the source code.' } });

    // Click mock dropzone to attach file
    const attachBtn = screen.getByText('Simulate Attach File');
    fireEvent.click(attachBtn);

    const submitBtn = screen.getByRole('button', { name: /submit deliverable/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSubmitDelivMutate).toHaveBeenCalledWith({
        note: 'Here is the source code.',
        attachmentIds: ['att-upload-1'],
      });
    });
  });

  it('handles Complete Agreement confirmation and error handling', async () => {
    const agreement = makeAgreementDetail({
      myRole: 'buyer',
      status: 'ACTIVE',
      myConfirmation: false,
    });

    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: agreement,
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);

    // Click Mark Complete opens dialog
    const completeBtn = screen.getByRole('button', { name: /mark complete/i });
    fireEvent.click(completeBtn);

    expect(screen.getByText('Confirm Completion')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /yes, mark complete/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockCompleteMutate).toHaveBeenCalled();
    });
  });

  it('handles Cancel Agreement dialog and validates required reason', async () => {
    const agreement = makeAgreementDetail({
      myRole: 'buyer',
      status: 'ACTIVE',
    });

    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: agreement,
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    expect(screen.getByText('Cancel Agreement')).toBeInTheDocument();

    const confirmCancelBtn = screen.getByRole('button', { name: /confirm cancellation/i });
    fireEvent.click(confirmCancelBtn);

    // Reason required validation
    expect(screen.getByText(/please provide a reason for cancelling/i)).toBeInTheDocument();
    expect(mockCancelMutate).not.toHaveBeenCalled();

    // Fill reason and submit
    const textarea = screen.getByLabelText(/reason for cancellation/i);
    fireEvent.change(textarea, { target: { value: 'Scope changed by mutual agreement' } });
    fireEvent.click(confirmCancelBtn);

    await waitFor(() => {
      expect(mockCancelMutate).toHaveBeenCalledWith({
        reason: 'Scope changed by mutual agreement',
      });
    });
  });

  it('handles Dispute Agreement dialog and validates required reason', async () => {
    const agreement = makeAgreementDetail({
      myRole: 'buyer',
      status: 'ACTIVE',
    });

    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: agreement,
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);

    const disputeBtn = screen.getByRole('button', { name: 'Dispute' });
    fireEvent.click(disputeBtn);

    expect(screen.getByText('Raise a Dispute')).toBeInTheDocument();

    const confirmDisputeBtn = screen.getByRole('button', { name: /submit dispute/i });
    fireEvent.click(confirmDisputeBtn);

    expect(screen.getByText(/please provide a reason for raising a dispute/i)).toBeInTheDocument();

    const textarea = screen.getByLabelText(/dispute details & reason/i);
    fireEvent.change(textarea, { target: { value: 'Deliverables failed acceptance criteria' } });
    fireEvent.click(confirmDisputeBtn);

    await waitFor(() => {
      expect(mockDisputeMutate).toHaveBeenCalledWith({
        reason: 'Deliverables failed acceptance criteria',
      });
    });
  });

  it('handles milestones creation and status transition', async () => {
    const milestone = makeMilestone({
      id: 'ms-1',
      title: 'Milestone One',
      status: 'PENDING',
    });

    const agreement = makeAgreementDetail({
      status: 'ACTIVE',
      milestones: [milestone],
    });

    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: agreement,
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);

    // Add milestone form
    const addMsBtn = screen.getByRole('button', { name: /add milestone/i });
    fireEvent.click(addMsBtn);

    const titleInput = screen.getByLabelText(/title \*/i);
    fireEvent.change(titleInput, { target: { value: 'Milestone Two' } });

    const saveMsBtn = screen.getByRole('button', { name: /save milestone/i });
    fireEvent.click(saveMsBtn);

    await waitFor(() => {
      expect(mockCreateMsMutate).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Milestone Two' }),
      );
    });

    // Milestone status transition: PENDING -> IN_PROGRESS
    const startBtn = screen.getByRole('button', { name: /start/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockUpdateMsMutate).toHaveBeenCalledWith({
        milestoneId: 'ms-1',
        data: { status: 'IN_PROGRESS' },
      });
    });
  });

  it('handles Accept Deliverable and Request Revision actions', async () => {
    const deliverable = makeDeliverable({
      id: 'd1',
      acceptedAt: null,
      revisionNote: null,
    });

    const agreement = makeAgreementDetail({
      myRole: 'buyer',
      status: 'ACTIVE',
      deliverables: [deliverable],
    });

    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: agreement,
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);

    // Accept deliverable
    const acceptBtn = screen.getByRole('button', { name: /accept deliverable/i });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(mockAcceptDelivMutate).toHaveBeenCalledWith('d1');
    });

    // Request revision
    const reqRevBtn = screen.getByRole('button', { name: /request revision/i });
    fireEvent.click(reqRevBtn);

    expect(screen.getByText('Request Revisions')).toBeInTheDocument();
    const noteTextarea = screen.getByLabelText(/feedback & revision notes/i);
    fireEvent.change(noteTextarea, { target: { value: 'Needs higher resolution assets' } });

    const sendRevBtn = screen.getByRole('button', { name: /send revision request/i });
    fireEvent.click(sendRevBtn);

    await waitFor(() => {
      expect(mockReqRevMutate).toHaveBeenCalledWith({
        deliverableId: 'd1',
        data: { note: 'Needs higher resolution assets' },
      });
    });
  });

  it('renders review form when COMPLETED and handles rating radio group', async () => {
    const agreement = makeAgreementDetail({
      status: 'COMPLETED',
      myRole: 'buyer',
    });

    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: agreement,
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);

    expect(screen.getByText('Feedback & Reviews')).toBeInTheDocument();

    // Check accessible rating radio group
    const radioGroup = screen.getByRole('radiogroup', { name: /rating/i });
    expect(radioGroup).toBeInTheDocument();

    const fourStars = screen.getByRole('radio', { name: '4 stars' });
    fireEvent.click(fourStars);
    expect(fourStars).toHaveAttribute('aria-checked', 'true');

    // Keyboard navigation: ArrowRight moves to 5 stars
    fireEvent.keyDown(fourStars, { key: 'ArrowRight' });
    const fiveStars = screen.getByRole('radio', { name: '5 stars' });
    expect(fiveStars).toHaveAttribute('aria-checked', 'true');

    // Fill optional comment
    const commentInput = screen.getByLabelText(/review comment/i);
    fireEvent.change(commentInput, { target: { value: 'Exceptional communication!' } });

    const submitReviewBtn = screen.getByRole('button', { name: /submit review/i });
    fireEvent.click(submitReviewBtn);

    await waitFor(() => {
      expect(mockReviewMutate).toHaveBeenCalledWith({
        rating: 5,
        comment: 'Exceptional communication!',
      });
    });
  });

  it('renders agreement events timeline', () => {
    const event = makeAgreementEvent({
      id: 'e1',
      type: 'DELIVERABLE_SUBMITTED',
      data: { note: 'Initial project submission' },
    });

    const agreement = makeAgreementDetail({
      events: [event],
    });

    vi.mocked(agreementsApi.useAgreement).mockReturnValue({
      data: agreement,
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreement,
    } as unknown as ReturnType<typeof agreementsApi.useAgreement>);

    render(<AgreementPage />);

    expect(screen.getByText('Activity Timeline')).toBeInTheDocument();
    expect(screen.getByText('Deliverable Submitted')).toBeInTheDocument();
    expect(screen.getByText(/Initial project submission/i)).toBeInTheDocument();
  });
});

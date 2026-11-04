import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgreementStatusBadge } from './agreement-status-badge';
import type { AgreementStatus } from '@market/shared';

describe('AgreementStatusBadge', () => {
  it('renders Active badge', () => {
    render(<AgreementStatusBadge status="ACTIVE" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders Delivered badge', () => {
    render(<AgreementStatusBadge status="DELIVERED" />);
    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });

  it('renders Completed badge', () => {
    render(<AgreementStatusBadge status="COMPLETED" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders Cancelled badge', () => {
    render(<AgreementStatusBadge status="CANCELLED" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders Disputed badge', () => {
    render(<AgreementStatusBadge status="DISPUTED" />);
    expect(screen.getByText('Disputed')).toBeInTheDocument();
  });

  it('renders fallback badge for unknown status', () => {
    render(<AgreementStatusBadge status={'UNKNOWN' as unknown as AgreementStatus} />);
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { AgreementsService, canTransitionMilestone, roleFor } from './agreements.service.js';
describe('agreement transition rules', () => {
  it('derives a role only for participants', () => {
    expect(roleFor({ buyerId: 'b', providerId: 'p' }, 'b')).toBe('buyer');
    expect(roleFor({ buyerId: 'b', providerId: 'p' }, 'p')).toBe('provider');
    expect(roleFor({ buyerId: 'b', providerId: 'p' }, 'x')).toBeNull();
  });
  it('only permits monotonic milestone transitions', () => {
    expect(canTransitionMilestone('PENDING', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionMilestone('IN_PROGRESS', 'DONE')).toBe(true);
    expect(canTransitionMilestone('DONE', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionMilestone('PENDING', 'DONE')).toBe(false);
  });
  it('does not expose participant-only operations to a stranger', async () => {
    const prisma = { agreement: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new AgreementsService(
      prisma as never,
      {} as never,
      {} as never,
      {
        emit: vi.fn(),
      } as never,
    );
    await expect(service.detail('a', 'x')).rejects.toThrow('Agreement not found');
    await expect(service.createMilestone('a', 'x', { title: 'M' })).rejects.toThrow();
    await expect(service.updateMilestone('a', 'm', 'x', {})).rejects.toThrow();
    await expect(
      service.submitDeliverable('a', 'x', { note: 'n', attachmentIds: ['u'] }),
    ).rejects.toThrow();
    await expect(service.resolveDeliverable('a', 'd', 'x')).rejects.toThrow();
    await expect(service.complete('a', 'x')).rejects.toThrow();
    await expect(service.cancel('a', 'x', 'r')).rejects.toThrow();
    await expect(service.dispute('a', 'x', 'r')).rejects.toThrow();
    await expect(service.review('a', 'x', { rating: 5 })).rejects.toThrow();
  });
  it('enforces participant roles before mutating deliverables', async () => {
    const agreement = { id: 'a', buyerId: 'buyer', providerId: 'provider', status: 'ACTIVE' };
    const prisma = {
      agreement: { findFirst: vi.fn().mockResolvedValue(agreement) },
      upload: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new AgreementsService(
      prisma as never,
      {} as never,
      {} as never,
      {
        emit: vi.fn(),
      } as never,
    );
    await expect(
      service.submitDeliverable('a', 'buyer', { note: 'n', attachmentIds: ['u'] }),
    ).rejects.toThrow('Agreement not found');
    await expect(service.resolveDeliverable('a', 'd', 'provider')).rejects.toThrow(
      'Agreement not found',
    );
    await expect(service.createMilestone('a', 'buyer', { title: 'M' })).rejects.toThrow();
    await expect(service.updateMilestone('a', 'm', 'buyer', { title: 'M2' })).rejects.toThrow();
    await expect(service.complete('a', 'buyer')).rejects.toThrow();
    await expect(service.cancel('a', 'buyer', 'r')).rejects.toThrow();
    await expect(service.dispute('a', 'buyer', 'r')).rejects.toThrow();
  });
});

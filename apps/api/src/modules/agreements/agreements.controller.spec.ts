import { describe, expect, it, vi } from 'vitest';
import { AgreementsController } from './agreements.controller.js';

describe('AgreementsController', () => {
  const service = {
    list: vi.fn(),
    detail: vi.fn(),
    createMilestone: vi.fn(),
    updateMilestone: vi.fn(),
    submitDeliverable: vi.fn(),
    resolveDeliverable: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    dispute: vi.fn(),
    review: vi.fn(),
  };
  const controller = new AgreementsController(service as never);
  const user = { id: 'user' } as never;
  it('forwards requests with the authenticated user', async () => {
    await controller.list(user, { limit: 1 });
    await controller.detail(user, { id: 'a' });
    await controller.createMilestone(user, { id: 'a' }, { title: 'one' });
    await controller.updateMilestone(user, { id: 'a', mid: 'm' }, { status: 'DONE' });
    await controller.deliver(user, { id: 'a' }, { note: '', attachmentIds: ['u'] });
    await controller.accept(user, { id: 'a', did: 'd' });
    await controller.revision(user, { id: 'a', did: 'd' }, { note: 'again' });
    await controller.complete(user, { id: 'a' });
    await controller.cancel(user, { id: 'a' }, { reason: 'no' });
    await controller.dispute(user, { id: 'a' }, { reason: 'no' });
    await controller.review(user, { id: 'a' }, { rating: 5 });
    expect(service.review).toHaveBeenCalledWith('a', 'user', { rating: 5 });
    expect(service.resolveDeliverable).toHaveBeenLastCalledWith('a', 'd', 'user', 'again');
  });
});

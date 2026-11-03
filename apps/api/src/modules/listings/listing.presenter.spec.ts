import { describe, expect, it, vi } from 'vitest';
import { ListingPresenter, toListingSummary } from './listing.presenter.js';
import { UserPresenter } from '../users/user.presenter.js';

describe('ListingPresenter', () => {
  it('maps listing to summary with categoryName and presigned thumbnailUrl from image key', async () => {
    const storage = { presignGet: vi.fn().mockResolvedValue('https://s3.example.com/thumb.jpg') };
    const userPresenter = new UserPresenter(storage as never);
    const presenter = new ListingPresenter(storage as never, userPresenter);

    const now = new Date();
    const summary = await presenter.toSummary({
      id: 'l1',
      owner: {
        id: 'u1',
        displayName: 'Alice',
        avatarKey: null,
      },
      categoryId: 'c1',
      category: { name: 'Technology' },
      firstImageKey: 'listings/l1/first.jpg',
      kind: 'REQUEST',
      status: 'OPEN',
      title: 'Need React dev',
      priceType: 'FIXED',
      priceMinCents: 5000,
      priceMaxCents: null,
      currency: 'USD',
      location: null,
      expiresAt: null,
      bidCount: 3,
      createdAt: now,
    });

    expect(summary).toEqual({
      id: 'l1',
      owner: expect.objectContaining({
        id: 'u1',
        displayName: 'Alice',
        avatarUrl: null,
      }),
      categoryId: 'c1',
      categoryName: 'Technology',
      thumbnailUrl: 'https://s3.example.com/thumb.jpg',
      kind: 'REQUEST',
      status: 'OPEN',
      title: 'Need React dev',
      priceType: 'FIXED',
      priceMinCents: 5000,
      priceMaxCents: null,
      currency: 'USD',
      location: null,
      expiresAt: null,
      bidCount: 3,
      createdAt: now,
    });
    expect(storage.presignGet).toHaveBeenCalledWith('listings/l1/first.jpg');
  });

  it('maps listing with images array fallback and exports toListingSummary helper', async () => {
    const storage = { presignGet: vi.fn().mockResolvedValue('https://s3.example.com/img0.jpg') };
    const userPresenter = new UserPresenter(storage as never);

    const now = new Date();
    const summary = await toListingSummary(
      {
        id: 'l2',
        owner: { id: 'u2', displayName: 'Bob' },
        categoryId: 'c2',
        categoryName: 'Design',
        images: [{ upload: { key: 'listings/l2/img0.jpg' } }],
        kind: 'OFFER',
        status: 'OPEN',
        title: 'Logo Design',
        priceType: 'NEGOTIABLE',
        priceMinCents: null,
        priceMaxCents: null,
        currency: 'USD',
        location: 'Remote',
        expiresAt: null,
        _count: { bids: 1 },
        createdAt: now,
      },
      storage as never,
      userPresenter,
    );

    expect(summary.categoryName).toBe('Design');
    expect(summary.thumbnailUrl).toBe('https://s3.example.com/img0.jpg');
    expect(summary.bidCount).toBe(1);
  });
});

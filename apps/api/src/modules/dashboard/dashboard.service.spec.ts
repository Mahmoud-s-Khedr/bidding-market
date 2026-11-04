import { describe, expect, it, vi } from 'vitest';
import { DashboardService } from './dashboard.service.js';
describe('DashboardService', () => {
  it('groups counts and sums pending bid states', async () => {
    const prisma = {
      listing: { groupBy: vi.fn().mockResolvedValue([{ status: 'OPEN', _count: { _all: 2 } }]) },
      bid: {
        groupBy: vi.fn().mockResolvedValue([
          { status: 'PENDING', _count: { _all: 1 } },
          { status: 'COUNTERED', _count: { _all: 2 } },
          { status: 'ACCEPTED', _count: { _all: 3 } },
        ]),
      },
      agreement: {
        groupBy: vi.fn().mockResolvedValue([{ status: 'ACTIVE', _count: { _all: 4 } }]),
      },
      notification: { count: vi.fn().mockResolvedValue(5) },
    };
    const conversations = {
      countUnreadForUser: vi.fn().mockResolvedValue(6),
    };
    await expect(
      new DashboardService(prisma as never, conversations as never).summary('u'),
    ).resolves.toEqual({
      listings: { open: 2, inProgress: 0, completed: 0 },
      bids: { pending: 3, accepted: 3 },
      agreements: { active: 4, completed: 0 },
      unreadMessages: 6,
      unreadNotifications: 5,
    });
  });
});

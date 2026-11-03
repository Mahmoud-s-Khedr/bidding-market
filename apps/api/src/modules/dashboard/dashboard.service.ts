import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}
  async summary(userId: string) {
    const [listingGroups, bidGroups, agreementGroups, unreadNotifications, unreadMessages] =
      await Promise.all([
        this.prisma.listing.groupBy({
          by: ['status'],
          where: { ownerId: userId, status: { in: ['OPEN', 'IN_PROGRESS', 'COMPLETED'] } },
          _count: { _all: true },
        }),
        this.prisma.bid.groupBy({
          by: ['status'],
          where: {
            bidderId: userId,
            status: { in: ['PENDING', 'SHORTLISTED', 'COUNTERED', 'ACCEPTED'] },
          },
          _count: { _all: true },
        }),
        this.prisma.agreement.groupBy({
          by: ['status'],
          where: {
            OR: [{ buyerId: userId }, { providerId: userId }],
            status: { in: ['ACTIVE', 'DELIVERED', 'COMPLETED'] },
          },
          _count: { _all: true },
        }),
        this.prisma.notification.count({ where: { userId, readAt: null } }),
        this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS count FROM "ConversationParticipant" cp
        JOIN "Message" m ON m."conversationId" = cp."conversationId"
        LEFT JOIN "Message" lr ON lr.id = cp."lastReadMessageId"
        WHERE cp."userId" = ${userId} AND m."senderId" <> ${userId}
          AND (lr."createdAt" IS NULL OR m."createdAt" > lr."createdAt")
      `),
      ]);
    const counts = <T extends string>(rows: Array<{ status: T; _count: { _all: number } }>) =>
      new Map(rows.map((row) => [row.status, row._count._all]));
    const listings = counts(listingGroups);
    const bids = counts(bidGroups);
    const agreements = counts(agreementGroups);
    return {
      listings: {
        open: listings.get('OPEN') ?? 0,
        inProgress: listings.get('IN_PROGRESS') ?? 0,
        completed: listings.get('COMPLETED') ?? 0,
      },
      bids: {
        pending:
          (bids.get('PENDING') ?? 0) +
          (bids.get('SHORTLISTED') ?? 0) +
          (bids.get('COUNTERED') ?? 0),
        accepted: bids.get('ACCEPTED') ?? 0,
      },
      agreements: {
        active: (agreements.get('ACTIVE') ?? 0) + (agreements.get('DELIVERED') ?? 0),
        completed: agreements.get('COMPLETED') ?? 0,
      },
      unreadMessages: Number(unreadMessages[0]?.count ?? 0n),
      unreadNotifications,
    };
  }
}

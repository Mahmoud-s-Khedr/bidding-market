import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminResolveReportInput, AdminUserUpdateInput, ReportInput } from '@market/shared';
import { Prisma, type ReportTargetType } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../common/auth.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import { ReportsEvents } from './reports.events.js';

type CursorQuery = { cursor?: string; limit: number };
type AdminUserQuery = CursorQuery & {
  q?: string;
  role?: 'USER' | 'ADMIN';
  status?: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
};
type ListingQuery = CursorQuery & {
  q?: string;
  status?: 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED' | 'REMOVED';
};
type ReportQuery = CursorQuery & { status?: 'OPEN' | 'RESOLVED' | 'DISMISSED' };
type AuditQuery = CursorQuery & { actorId?: string; action?: string; targetType?: string };
type Target = { ownerId?: string; senderId?: string; userId?: string };
const adminUserSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  suspendedReason: true,
  suspendedAt: true,
  displayName: true,
  createdAt: true,
} as const;

function cursor(value?: string): { createdAt: Date; id: string } | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: string;
      id?: string;
    };
    if (!parsed.id || !parsed.createdAt || Number.isNaN(Date.parse(parsed.createdAt)))
      throw new Error();
    return { id: parsed.id, createdAt: new Date(parsed.createdAt) };
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
}
function encode(row: { id: string; createdAt: Date }): string {
  return Buffer.from(
    JSON.stringify({ id: row.id, createdAt: row.createdAt.toISOString() }),
  ).toString('base64url');
}
function cursorWhere(value: { createdAt: Date; id: string } | undefined) {
  return value
    ? {
        OR: [
          { createdAt: { lt: value.createdAt } },
          { createdAt: value.createdAt, id: { lt: value.id } },
        ],
      }
    : {};
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, input: ReportInput) {
    await this.assertVisibleTarget(user, input.targetType, input.targetId, true);
    try {
      return await this.prisma.report.create({ data: { reporterId: user.id, ...input } });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('An open report already exists for this target');
      throw error;
    }
  }

  async assertVisibleTarget(
    user: AuthUser,
    type: ReportTargetType,
    id: string,
    reporting = false,
  ): Promise<Target> {
    if (type === 'LISTING') {
      const row = await this.prisma.listing.findUnique({
        where: { id },
        select: { ownerId: true },
      });
      if (!row) throw new NotFoundException('Target not found');
      if (reporting && row.ownerId === user.id)
        throw new BadRequestException('You cannot report your own listing');
      return row;
    }
    if (type === 'USER') {
      const row = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!row) throw new NotFoundException('Target not found');
      if (reporting && row.id === user.id)
        throw new BadRequestException('You cannot report yourself');
      return { userId: row.id };
    }
    if (type === 'MESSAGE') {
      const row = await this.prisma.message.findUnique({
        where: { id },
        select: {
          senderId: true,
          conversationId: true,
          conversation: {
            select: { participants: { where: { userId: user.id }, select: { userId: true } } },
          },
        },
      });
      if (!row || (user.role !== 'ADMIN' && row.conversation.participants.length === 0))
        throw new NotFoundException('Target not found');
      return row;
    }
    if (type === 'BID') {
      const row = await this.prisma.bid.findUnique({
        where: { id },
        select: { bidderId: true, listing: { select: { ownerId: true } } },
      });
      if (
        !row ||
        (user.role !== 'ADMIN' && row.bidderId !== user.id && row.listing.ownerId !== user.id)
      )
        throw new NotFoundException('Target not found');
      return { userId: row.bidderId, ownerId: row.listing.ownerId };
    }
    const row = await this.prisma.agreement.findUnique({
      where: { id },
      select: { buyerId: true, providerId: true },
    });
    if (!row || (user.role !== 'ADMIN' && row.buyerId !== user.id && row.providerId !== user.id))
      throw new NotFoundException('Target not found');
    return { userId: row.buyerId, ownerId: row.providerId };
  }
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly events: ReportsEvents,
  ) {}

  private async createAudit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    targetType: string,
    targetId: string | null,
    data: Prisma.InputJsonValue,
  ) {
    await tx.auditLog.create({ data: { actorId, action, targetType, targetId, data } });
  }

  async stats() {
    const [users, listings, bids, agreements, openReports, series] = await Promise.all([
      this.prisma.user.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.listing.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.bid.count(),
      this.prisma.agreement.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.$queryRaw<
        Array<{ day: Date; signups: bigint; listings: bigint; bids: bigint; agreements: bigint }>
      >(
        Prisma.sql`SELECT d.day, (SELECT COUNT(*) FROM "User" u WHERE u."createdAt" >= d.day AND u."createdAt" < d.day + interval '1 day')::bigint AS signups, (SELECT COUNT(*) FROM "Listing" l WHERE l."createdAt" >= d.day AND l."createdAt" < d.day + interval '1 day')::bigint AS listings, (SELECT COUNT(*) FROM "Bid" b WHERE b."createdAt" >= d.day AND b."createdAt" < d.day + interval '1 day')::bigint AS bids, (SELECT COUNT(*) FROM "Agreement" a WHERE a."createdAt" >= d.day AND a."createdAt" < d.day + interval '1 day')::bigint AS agreements FROM generate_series((now() AT TIME ZONE 'utc')::date - interval '29 days', (now() AT TIME ZONE 'utc')::date, interval '1 day') d(day) ORDER BY d.day`,
      ),
    ]);
    const count = <T extends { status: string; _count: { id: number } }>(
      rows: T[],
      statuses: readonly string[],
    ) =>
      Object.fromEntries(
        statuses.map((status) => [status, rows.find((r) => r.status === status)?._count.id ?? 0]),
      );
    return {
      users: count(users, ['ACTIVE', 'SUSPENDED', 'BANNED']),
      listings: count(listings, ['DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'REMOVED']),
      bids,
      agreements: count(agreements, ['ACTIVE', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTED']),
      openReports,
      daily: series.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        signups: Number(r.signups),
        listings: Number(r.listings),
        bids: Number(r.bids),
        agreements: Number(r.agreements),
      })),
    };
  }

  async users(query: AdminUserQuery) {
    const after = cursor(query.cursor);
    const where = {
      ...cursorWhere(after),
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { displayName: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: adminUserSelect,
    });
    return {
      items: rows.slice(0, query.limit),
      nextCursor: rows.length > query.limit ? encode(rows[query.limit - 1]!) : null,
    };
  }

  async updateUser(actorId: string, id: string, input: AdminUserUpdateInput) {
    if (actorId === id) throw new BadRequestException('You cannot modify yourself');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(8675309)`);
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundException('User not found');
      if (user.role === 'ADMIN' && input.role === 'USER') {
        const admins = await tx.user.count({ where: { role: 'ADMIN' } });
        if (admins <= 1) throw new ConflictException('Cannot demote the last admin');
      }
      const status = input.status ?? user.status;
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(input.role && { role: input.role }),
          ...(input.status && { status }),
          ...(status === 'ACTIVE'
            ? { suspendedAt: null, suspendedReason: null }
            : input.status
              ? { suspendedAt: new Date(), suspendedReason: input.reason ?? null }
              : {}),
        },
        select: adminUserSelect,
      });
      if (input.status === 'SUSPENDED' || input.status === 'BANNED')
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await this.createAudit(tx, actorId, 'USER_UPDATED', 'USER', id, {
        role: updated.role,
        status: updated.status,
        reason: input.reason ?? null,
      });
      return updated;
    });
  }

  async listings(query: ListingQuery) {
    const after = cursor(query.cursor);
    const rows = await this.prisma.listing.findMany({
      where: {
        ...cursorWhere(after),
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { owner: { select: { id: true, displayName: true } } },
    });
    return {
      items: rows.slice(0, query.limit),
      nextCursor: rows.length > query.limit ? encode(rows[query.limit - 1]!) : null,
    };
  }

  private async removeInTx(tx: Prisma.TransactionClient, listingId: string, reason: string) {
    const listing = await tx.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status === 'REMOVED') throw new ConflictException('Listing is already removed');
    const changed = await tx.listing.updateMany({
      where: { id: listingId, status: { not: 'REMOVED' } },
      data: {
        status: 'REMOVED',
        previousStatus: listing.status,
        removedReason: reason,
        removedAt: new Date(),
      },
    });
    if (!changed.count) throw new ConflictException('Listing is already removed');
    if (listing.status === 'OPEN')
      await tx.bid.updateMany({
        where: { listingId, status: { in: ['PENDING', 'SHORTLISTED', 'COUNTERED'] } },
        data: { status: 'DECLINED', rejectReason: 'listing removed by moderator' },
      });
    return listing;
  }
  async removeListing(actorId: string, id: string, reason: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const listing = await this.removeInTx(tx, id, reason);
      await this.createAudit(tx, actorId, 'LISTING_REMOVED', 'LISTING', id, { reason });
      return listing;
    });
    await this.categories.invalidateCache();
    return result;
  }
  async restoreListing(actorId: string, id: string, reason: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({ where: { id } });
      if (!listing) throw new NotFoundException('Listing not found');
      if (listing.status !== 'REMOVED' || !listing.previousStatus)
        throw new ConflictException('Listing is not removed');
      const changed = await tx.listing.updateMany({
        where: { id, status: 'REMOVED' },
        data: {
          status: listing.previousStatus,
          previousStatus: null,
          removedReason: null,
          removedAt: null,
        },
      });
      if (!changed.count) throw new ConflictException('Listing is not removed');
      await this.createAudit(tx, actorId, 'LISTING_RESTORED', 'LISTING', id, { reason });
      return listing;
    });
    await this.categories.invalidateCache();
    return result;
  }

  async reports(query: ReportQuery) {
    const after = cursor(query.cursor);
    const rows = await this.prisma.report.findMany({
      where: { ...cursorWhere(after), ...(query.status ? { status: query.status } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { reporter: { select: { id: true, displayName: true, email: true } } },
    });
    return {
      items: await Promise.all(
        rows
          .slice(0, query.limit)
          .map(async (r) => ({ ...r, target: await this.preview(r.targetType, r.targetId) })),
      ),
      nextCursor: rows.length > query.limit ? encode(rows[query.limit - 1]!) : null,
    };
  }
  private async preview(type: ReportTargetType, id: string) {
    if (type === 'LISTING')
      return this.prisma.listing.findUnique({
        where: { id },
        select: { id: true, title: true, status: true },
      });
    if (type === 'USER')
      return this.prisma.user.findUnique({
        where: { id },
        select: { id: true, displayName: true, status: true },
      });
    if (type === 'MESSAGE')
      return this.prisma.message.findUnique({
        where: { id },
        select: { id: true, conversationId: true, body: true, deletedAt: true },
      });
    if (type === 'BID')
      return this.prisma.bid.findUnique({
        where: { id },
        select: { id: true, amountCents: true, status: true },
      });
    return this.prisma.agreement.findUnique({ where: { id }, select: { id: true, status: true } });
  }

  async resolveReport(actorId: string, id: string, input: AdminResolveReportInput) {
    const result = await this.prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({ where: { id } });
      if (!report) throw new NotFoundException('Report not found');
      const outcome = input.action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED';
      const claimed = await tx.report.updateMany({
        where: { id, status: 'OPEN' },
        data: {
          status: outcome,
          resolution: input.action,
          resolutionNote: input.note,
          resolvedById: actorId,
          resolvedAt: new Date(),
        },
      });
      if (!claimed.count) throw new ConflictException('Report has already been resolved');
      if (input.action === 'REMOVE_CONTENT') {
        if (report.targetType === 'LISTING') await this.removeInTx(tx, report.targetId, input.note);
        else if (report.targetType === 'MESSAGE') {
          const changed = await tx.message.updateMany({
            where: { id: report.targetId, deletedAt: null },
            data: { deletedAt: new Date(), deletedById: actorId, body: null },
          });
          if (!changed.count) throw new ConflictException('Message is already removed');
        } else if (report.targetType === 'BID') {
          const changed = await tx.bid.updateMany({
            where: { id: report.targetId, status: { in: ['PENDING', 'SHORTLISTED', 'COUNTERED'] } },
            data: { status: 'REJECTED', rejectReason: 'removed by moderator' },
          });
          if (!changed.count) throw new ConflictException('Bid cannot be removed');
        } else throw new BadRequestException('Content removal is not applicable to this target');
      }
      if (input.action === 'SUSPEND_USER') {
        let userId: string | null = null;
        if (report.targetType === 'USER') userId = report.targetId;
        if (report.targetType === 'LISTING')
          userId =
            (
              await tx.listing.findUnique({
                where: { id: report.targetId },
                select: { ownerId: true },
              })
            )?.ownerId ?? null;
        if (report.targetType === 'MESSAGE')
          userId =
            (
              await tx.message.findUnique({
                where: { id: report.targetId },
                select: { senderId: true },
              })
            )?.senderId ?? null;
        if (report.targetType === 'BID')
          userId =
            (
              await tx.bid.findUnique({
                where: { id: report.targetId },
                select: { bidderId: true },
              })
            )?.bidderId ?? null;
        if (report.targetType === 'AGREEMENT')
          throw new BadRequestException('User suspension is not applicable to agreements');
        if (!userId) throw new NotFoundException('Target not found');
        const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (!target) throw new NotFoundException('Target not found');
        if (userId === actorId) throw new BadRequestException('You cannot suspend yourself');
        if (target.role === 'ADMIN')
          throw new ConflictException('Administrators cannot be suspended by report resolution');
        await tx.user.update({
          where: { id: userId },
          data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: input.note },
        });
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await this.createAudit(tx, actorId, 'USER_UPDATED', 'USER', userId, {
          status: 'SUSPENDED',
          reason: input.note,
        });
      }
      await tx.report.updateMany({
        where: { targetType: report.targetType, targetId: report.targetId, status: 'OPEN' },
        data: {
          status: outcome,
          resolution: input.action,
          resolutionNote: input.note,
          resolvedById: actorId,
          resolvedAt: new Date(),
        },
      });
      await this.createAudit(tx, actorId, 'REPORT_RESOLVED', 'REPORT', id, {
        action: input.action,
        note: input.note,
      });
      return report;
    });
    if (input.action === 'REMOVE_CONTENT' && result.targetType === 'LISTING')
      await this.categories.invalidateCache();
    this.events.emit('report.resolved', { reportId: id, reporterId: result.reporterId });
    return {
      id,
      status: input.action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED',
      resolution: input.action,
    };
  }
  async audit(query: AuditQuery) {
    const after = cursor(query.cursor);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...cursorWhere(after),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return {
      items: rows.slice(0, query.limit),
      nextCursor: rows.length > query.limit ? encode(rows[query.limit - 1]!) : null,
    };
  }
}

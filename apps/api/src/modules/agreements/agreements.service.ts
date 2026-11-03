import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DeliverableInput, MilestoneInput, MilestoneUpdateInput } from '@market/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { paginate } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { publicUserSelect, UserPresenter } from '../users/user.presenter.js';

type Role = 'buyer' | 'provider';
type ActionableStatus = 'ACTIVE' | 'DELIVERED';
function isActionable(status: string): status is ActionableStatus {
  return status === 'ACTIVE' || status === 'DELIVERED';
}

export function roleFor(
  agreement: { buyerId: string; providerId: string },
  userId: string,
): Role | null {
  if (agreement.buyerId === userId) return 'buyer';
  if (agreement.providerId === userId) return 'provider';
  return null;
}

export function canTransitionMilestone(
  from: 'PENDING' | 'IN_PROGRESS' | 'DONE',
  to: 'PENDING' | 'IN_PROGRESS' | 'DONE',
): boolean {
  return (
    from === to ||
    (from === 'PENDING' && to === 'IN_PROGRESS') ||
    (from === 'IN_PROGRESS' && to === 'DONE')
  );
}

@Injectable()
export class AgreementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly users: UserPresenter,
    private readonly events: EventEmitter2,
  ) {}

  private async participant(id: string, userId: string) {
    const agreement = await this.prisma.agreement.findFirst({
      where: { id, OR: [{ buyerId: userId }, { providerId: userId }] },
    });
    if (!agreement) throw new NotFoundException('Agreement not found');
    return agreement;
  }

  private async attachment(upload: {
    id: string;
    key: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    return { ...upload, url: await this.storage.presignGet(upload.key) };
  }

  private async present(
    agreement: Awaited<ReturnType<AgreementsService['loadDetail']>>,
    userId: string,
  ) {
    const myRole = roleFor(agreement, userId);
    if (!myRole) throw new NotFoundException('Agreement not found');
    const [buyer, provider] = await Promise.all([
      this.users.toPublicUser(agreement.buyer),
      this.users.toPublicUser(agreement.provider),
    ]);
    const deliverables = await Promise.all(
      agreement.deliverables.map(async (deliverable) => ({
        ...deliverable,
        attachments: await Promise.all(
          deliverable.attachments.map(({ upload }) => this.attachment(upload)),
        ),
      })),
    );
    return {
      ...agreement,
      buyer,
      provider,
      bid: { ...agreement.bid, bidder: await this.users.toPublicUser(agreement.bid.bidder) },
      listing: {
        ...agreement.listing,
        categoryName: agreement.listing.category.name,
        thumbnailUrl: null,
        bidCount: 0,
        owner: await this.users.toPublicUser(agreement.listing.owner),
      },
      conversationId: agreement.conversation?.id ?? null,
      milestones: agreement.milestones,
      deliverables,
      events: agreement.events,
      myRole,
      myConfirmation:
        myRole === 'buyer'
          ? agreement.buyerConfirmedAt !== null
          : agreement.providerConfirmedAt !== null,
    };
  }

  private loadDetail(id: string) {
    return this.prisma.agreement.findUniqueOrThrow({
      where: { id },
      include: {
        buyer: { select: publicUserSelect },
        provider: { select: publicUserSelect },
        listing: { include: { owner: { select: publicUserSelect }, category: true } },
        bid: { include: { bidder: { select: publicUserSelect } } },
        conversation: true,
        milestones: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        deliverables: {
          include: { attachments: { include: { upload: true } } },
          orderBy: { createdAt: 'asc' },
        },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async list(
    userId: string,
    query: {
      status?: 'ACTIVE' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
      role?: Role;
      cursor?: string;
      limit: number;
    },
  ) {
    const where = {
      ...(query.role === 'buyer'
        ? { buyerId: userId }
        : query.role === 'provider'
          ? { providerId: userId }
          : { OR: [{ buyerId: userId }, { providerId: userId }] }),
      ...(query.status ? { status: query.status } : {}),
    };
    const rows = await this.prisma.agreement.findMany({
      where,
      take: query.limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        buyer: { select: publicUserSelect },
        provider: { select: publicUserSelect },
        listing: { include: { owner: { select: publicUserSelect }, category: true } },
        bid: { include: { bidder: { select: publicUserSelect } } },
        conversation: true,
        milestones: true,
        deliverables: { include: { attachments: { include: { upload: true } } } },
        events: true,
      },
    });
    const page = paginate(rows, query.limit);
    return {
      items: await Promise.all(page.items.map((row) => this.present(row, userId))),
      nextCursor: page.nextCursor,
    };
  }

  async detail(id: string, userId: string) {
    await this.participant(id, userId);
    return this.present(await this.loadDetail(id), userId);
  }

  async createMilestone(id: string, userId: string, input: MilestoneInput) {
    const agreement = await this.participant(id, userId);
    if (!isActionable(agreement.status)) throw new ConflictException('Agreement is not actionable');
    return this.prisma.$transaction(async (tx) => {
      const position = await tx.milestone.count({ where: { agreementId: id } });
      const milestone = await tx.milestone.create({
        data: {
          agreementId: id,
          title: input.title,
          amountCents: input.amountCents,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          position,
        },
      });
      await tx.agreementEvent.create({
        data: {
          agreementId: id,
          actorId: userId,
          type: 'MILESTONE_CREATED',
          data: { milestoneId: milestone.id },
        },
      });
      return milestone;
    });
  }

  async updateMilestone(
    id: string,
    milestoneId: string,
    userId: string,
    input: MilestoneUpdateInput,
  ) {
    const agreement = await this.participant(id, userId);
    if (!isActionable(agreement.status)) throw new ConflictException('Agreement is not actionable');
    const milestone = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, agreementId: id },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (input.status && !canTransitionMilestone(milestone.status, input.status))
      throw new ConflictException('Invalid milestone status transition');
    const updated = await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
    });
    await this.prisma.agreementEvent.create({
      data: {
        agreementId: id,
        actorId: userId,
        type: 'MILESTONE_UPDATED',
        data: { milestoneId, ...input },
      },
    });
    return updated;
  }

  async submitDeliverable(id: string, userId: string, input: DeliverableInput) {
    const agreement = await this.participant(id, userId);
    if (roleFor(agreement, userId) !== 'provider')
      throw new NotFoundException('Agreement not found');
    if (
      !input.attachmentIds.length ||
      new Set(input.attachmentIds).size !== input.attachmentIds.length
    )
      throw new BadRequestException('attachmentIds must be unique');
    const uploads = await this.prisma.upload.findMany({
      where: {
        id: { in: input.attachmentIds },
        uploaderId: userId,
        purpose: 'DELIVERABLE',
        status: 'READY',
      },
    });
    if (uploads.length !== input.attachmentIds.length)
      throw new BadRequestException(
        'Attachments must be ready DELIVERABLE uploads owned by provider',
      );
    const deliverable = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.agreement.updateMany({
        where: { id, status: { in: ['ACTIVE', 'DELIVERED'] } },
        data: { status: 'DELIVERED', statusChangedAt: new Date() },
      });
      if (!moved.count) throw new ConflictException('Agreement is not actionable');
      const created = await tx.deliverable.create({
        data: {
          agreementId: id,
          note: input.note,
          submittedById: userId,
          attachments: { create: input.attachmentIds.map((uploadId) => ({ uploadId })) },
        },
        include: { attachments: { include: { upload: true } } },
      });
      await tx.agreementEvent.create({
        data: {
          agreementId: id,
          actorId: userId,
          type: 'DELIVERABLE_SUBMITTED',
          data: { deliverableId: created.id },
        },
      });
      return created;
    });
    this.events.emit('agreement.deliverable_submitted', {
      agreementId: id,
      deliverableId: deliverable.id,
      providerId: userId,
    });
    return {
      ...deliverable,
      attachments: await Promise.all(
        deliverable.attachments.map(({ upload }) => this.attachment(upload)),
      ),
    };
  }

  async resolveDeliverable(
    id: string,
    deliverableId: string,
    userId: string,
    revisionNote?: string,
  ) {
    const agreement = await this.participant(id, userId);
    if (roleFor(agreement, userId) !== 'buyer') throw new NotFoundException('Agreement not found');
    const deliverable = await this.prisma.$transaction(async (tx) => {
      const current = await tx.deliverable.findFirst({
        where: { id: deliverableId, agreementId: id },
      });
      if (!current) throw new NotFoundException('Deliverable not found');
      const changed = await tx.deliverable.updateMany({
        where: { id: deliverableId, acceptedAt: null, revisionNote: null },
        data: revisionNote === undefined ? { acceptedAt: new Date() } : { revisionNote },
      });
      if (!changed.count) throw new ConflictException('Deliverable has already been resolved');
      const status = revisionNote === undefined ? 'DELIVERED' : 'ACTIVE';
      const moved = await tx.agreement.updateMany({
        where: { id, status: 'DELIVERED' },
        data: { status, statusChangedAt: new Date() },
      });
      if (!moved.count) throw new ConflictException('Agreement is not awaiting a deliverable');
      await tx.agreementEvent.create({
        data: {
          agreementId: id,
          actorId: userId,
          type: revisionNote === undefined ? 'DELIVERABLE_ACCEPTED' : 'REVISION_REQUESTED',
          data: { deliverableId, ...(revisionNote === undefined ? {} : { note: revisionNote }) },
        },
      });
      return tx.deliverable.findUniqueOrThrow({
        where: { id: deliverableId },
        include: { attachments: { include: { upload: true } } },
      });
    });
    this.events.emit(
      revisionNote === undefined
        ? 'agreement.deliverable_accepted'
        : 'agreement.revision_requested',
      { agreementId: id, deliverableId, buyerId: userId },
    );
    return {
      ...deliverable,
      attachments: await Promise.all(
        deliverable.attachments.map(({ upload }) => this.attachment(upload)),
      ),
    };
  }

  async complete(id: string, userId: string) {
    const agreement = await this.participant(id, userId);
    const role = roleFor(agreement, userId)!;
    if (agreement.status === 'COMPLETED') return this.detail(id, userId);
    if (!isActionable(agreement.status))
      throw new ConflictException('Agreement cannot be completed');
    const completed = await this.prisma.$transaction(async (tx) => {
      const set =
        role === 'buyer' ? { buyerConfirmedAt: new Date() } : { providerConfirmedAt: new Date() };
      await tx.agreement.updateMany({
        where: {
          id,
          status: { in: ['ACTIVE', 'DELIVERED'] },
          ...(role === 'buyer' ? { buyerConfirmedAt: null } : { providerConfirmedAt: null }),
        },
        data: set,
      });
      const final = await tx.agreement.updateMany({
        where: {
          id,
          status: { in: ['ACTIVE', 'DELIVERED'] },
          buyerConfirmedAt: { not: null },
          providerConfirmedAt: { not: null },
        },
        data: { status: 'COMPLETED', completedAt: new Date(), statusChangedAt: new Date() },
      });
      if (final.count) {
        await tx.listing.update({
          where: { id: agreement.listingId },
          data: { status: 'COMPLETED' },
        });
        await tx.user.updateMany({
          where: { id: { in: [agreement.buyerId, agreement.providerId] } },
          data: { completedCount: { increment: 1 } },
        });
        await tx.agreementEvent.create({
          data: { agreementId: id, actorId: userId, type: 'COMPLETED' },
        });
      }
      return final.count === 1;
    });
    if (completed) this.events.emit('agreement.completed', { agreementId: id, actorId: userId });
    return this.detail(id, userId);
  }

  async cancel(id: string, userId: string, reason: string) {
    const agreement = await this.participant(id, userId);
    const changed = await this.prisma.$transaction(async (tx) => {
      const update = await tx.agreement.updateMany({
        where: { id, status: { notIn: ['COMPLETED', 'CANCELLED', 'DISPUTED'] } },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: userId,
          cancelReason: reason,
          statusChangedAt: new Date(),
        },
      });
      if (!update.count) throw new ConflictException('Agreement cannot be cancelled');
      await tx.listing.update({ where: { id: agreement.listingId }, data: { status: 'CLOSED' } });
      await tx.agreementEvent.create({
        data: { agreementId: id, actorId: userId, type: 'CANCELLED', data: { reason } },
      });
      return true;
    });
    if (changed) this.events.emit('agreement.cancelled', { agreementId: id, actorId: userId });
    return this.detail(id, userId);
  }

  async dispute(id: string, userId: string, reason: string) {
    await this.participant(id, userId);
    await this.prisma.$transaction(async (tx) => {
      const update = await tx.agreement.updateMany({
        where: { id, status: { notIn: ['COMPLETED', 'CANCELLED', 'DISPUTED'] } },
        data: { status: 'DISPUTED', disputeReason: reason, statusChangedAt: new Date() },
      });
      if (!update.count) throw new ConflictException('Agreement cannot be disputed');
      await tx.report.create({
        data: {
          reporterId: userId,
          targetType: 'AGREEMENT',
          targetId: id,
          reason: 'OTHER',
          details: reason,
        },
      });
      await tx.agreementEvent.create({
        data: { agreementId: id, actorId: userId, type: 'DISPUTED', data: { reason } },
      });
    });
    this.events.emit('agreement.disputed', { agreementId: id, actorId: userId });
    return this.detail(id, userId);
  }

  async review(id: string, userId: string, input: { rating: number; comment?: string }) {
    const agreement = await this.participant(id, userId);
    if (agreement.status !== 'COMPLETED')
      throw new ConflictException('Reviews require a completed agreement');
    const targetId = agreement.buyerId === userId ? agreement.providerId : agreement.buyerId;
    try {
      const review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.review.create({
          data: {
            agreementId: id,
            authorId: userId,
            targetId,
            rating: input.rating,
            comment: input.comment,
          },
        });
        const aggregates = await tx.$queryRaw<Array<{ average: number | null; count: bigint }>>(
          Prisma.sql`SELECT AVG("rating")::float AS average, COUNT(*) AS count FROM "Review" WHERE "targetId" = ${targetId}`,
        );
        const aggregate = aggregates[0];
        await tx.user.update({
          where: { id: targetId },
          data: { ratingAvg: aggregate?.average ?? 0, ratingCount: Number(aggregate?.count ?? 0n) },
        });
        return created;
      });
      this.events.emit('review.created', {
        agreementId: id,
        reviewId: review.id,
        authorId: userId,
        targetId,
      });
      return review;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('You have already reviewed this agreement');
      throw error;
    }
  }
}

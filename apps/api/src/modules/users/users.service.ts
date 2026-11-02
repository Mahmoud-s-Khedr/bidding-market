import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateProfileInput } from '@market/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  async profile(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarKey,
      bio: user.bio,
      location: user.location,
      isBusiness: user.isBusiness,
      companyName: user.companyName,
      ratingAvg: user.ratingAvg,
      ratingCount: user.ratingCount,
      completedCount: user.completedCount,
      createdAt: user.createdAt,
    };
  }
  async update(id: string, input: UpdateProfileInput) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { ...input, avatarKey: input.avatarKey },
    });
    return this.profile(user.id);
  }
  async reviews(id: string, cursor?: string, limit = 20) {
    await this.profile(id);
    const reviews = await this.prisma.review.findMany({
      where: { targetId: id },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { id: true, displayName: true, avatarKey: true } } },
    });
    const next = reviews.length > limit ? (reviews.pop()?.id ?? null) : null;
    return { items: reviews, nextCursor: next };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import type { PublicUser, UpdateProfileInput } from '@market/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { paginate } from '../../common/pagination.js';

const publicUserSelect = {
  id: true,
  displayName: true,
  avatarKey: true,
  bio: true,
  location: true,
  isBusiness: true,
  companyName: true,
  ratingAvg: true,
  ratingCount: true,
  completedCount: true,
  createdAt: true,
} as const;

type PublicUserData = {
  id: string;
  displayName: string;
  avatarKey: string | null;
  bio: string | null;
  location: string | null;
  isBusiness: boolean;
  companyName: string | null;
  ratingAvg: number;
  ratingCount: number;
  completedCount: number;
  createdAt: Date;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublicUser(user: PublicUserData): PublicUser {
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

  async profile(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return this.toPublicUser(user);
  }

  async update(id: string, input: UpdateProfileInput): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.displayName !== undefined && { displayName: input.displayName }),
        ...(input.bio !== undefined && { bio: input.bio }),
        ...(input.location !== undefined && { location: input.location }),
        ...(input.avatarKey !== undefined && { avatarKey: input.avatarKey }),
        ...(input.isBusiness !== undefined && { isBusiness: input.isBusiness }),
        ...(input.companyName !== undefined && { companyName: input.companyName }),
      },
      select: publicUserSelect,
    });
    return this.toPublicUser(user);
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
    return paginate(reviews, limit);
  }
}

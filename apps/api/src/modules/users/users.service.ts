import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicUser, UpdateProfileInput } from '@market/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { paginate } from '../../common/pagination.js';
import { publicUserSelect, UserPresenter } from './user.presenter.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userPresenter: UserPresenter,
  ) {}

  async profile(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return this.userPresenter.toPublicUser(user);
  }

  async update(id: string, input: UpdateProfileInput): Promise<PublicUser> {
    let newAvatarKey: string | null | undefined = undefined;
    if (input.avatarUploadId !== undefined) {
      if (input.avatarUploadId === null) {
        newAvatarKey = null;
      } else {
        const upload = await this.prisma.upload.findUnique({
          where: { id: input.avatarUploadId },
        });
        if (!upload) {
          throw new BadRequestException('Avatar upload not found');
        }
        if (upload.uploaderId !== id) {
          throw new BadRequestException('Avatar upload belongs to another user');
        }
        if (upload.status !== 'READY') {
          throw new BadRequestException('Avatar upload is not ready');
        }
        if (upload.purpose !== 'AVATAR') {
          throw new BadRequestException('Upload purpose must be AVATAR');
        }
        newAvatarKey = upload.key;
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.displayName !== undefined && { displayName: input.displayName }),
        ...(input.bio !== undefined && { bio: input.bio }),
        ...(input.location !== undefined && { location: input.location }),
        ...(newAvatarKey !== undefined && { avatarKey: newAvatarKey }),
        ...(input.isBusiness !== undefined && { isBusiness: input.isBusiness }),
        ...(input.companyName !== undefined && { companyName: input.companyName }),
      },
      select: publicUserSelect,
    });
    return this.userPresenter.toPublicUser(user);
  }

  async reviews(id: string, cursor?: string, limit = 20) {
    await this.profile(id);
    const reviews = await this.prisma.review.findMany({
      where: { targetId: id },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { author: { select: publicUserSelect } },
    });
    const paginated = paginate(reviews, limit);
    const items = await Promise.all(
      paginated.items.map(async (r) => {
        if ('author' in r && r.author) {
          const author = await this.userPresenter.toPublicUser(r.author);
          return { ...r, author };
        }
        return r;
      }),
    );
    return {
      items,
      nextCursor: paginated.nextCursor,
    };
  }
}

import { Injectable } from '@nestjs/common';
import type { PrivateUser, PublicUser } from '@market/shared';
import { StorageService } from '../../storage/storage.service.js';

export const publicUserSelect = {
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

export const privateUserSelect = {
  ...publicUserSelect,
  email: true,
  role: true,
} as const;

export interface PublicUserData {
  id: string;
  displayName: string;
  avatarKey?: string | null;
  bio?: string | null;
  location?: string | null;
  isBusiness?: boolean;
  companyName?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  completedCount?: number;
  createdAt?: Date;
}

export interface PrivateUserData extends PublicUserData {
  email: string;
  role: 'USER' | 'ADMIN';
}

@Injectable()
export class UserPresenter {
  private readonly avatarCache = new Map<string, { url: string; expiresAt: number }>();

  constructor(private readonly storage: StorageService) {}

  async presignAvatar(avatarKey: string | null | undefined): Promise<string | null> {
    if (!avatarKey) return null;
    const now = Date.now();
    const cached = this.avatarCache.get(avatarKey);
    if (cached && cached.expiresAt > now) {
      return cached.url;
    }
    const url = await this.storage.presignGet(avatarKey);
    this.avatarCache.set(avatarKey, { url, expiresAt: now + 240_000 });
    return url;
  }

  async toPublicUser(user: PublicUserData): Promise<PublicUser> {
    const avatarUrl = await this.presignAvatar(user.avatarKey);
    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl,
      bio: user.bio ?? null,
      location: user.location ?? null,
      isBusiness: user.isBusiness ?? false,
      companyName: user.companyName ?? null,
      ratingAvg: user.ratingAvg ?? 0,
      ratingCount: user.ratingCount ?? 0,
      completedCount: user.completedCount ?? 0,
      createdAt: user.createdAt ?? new Date(),
    };
  }

  async toPrivateUser(user: PrivateUserData): Promise<PrivateUser> {
    const publicUser = await this.toPublicUser(user);
    return {
      ...publicUser,
      email: user.email,
      role: user.role,
    };
  }
}

export async function toPublicUser(
  user: PublicUserData,
  storage: StorageService,
): Promise<PublicUser> {
  const presenter = new UserPresenter(storage);
  return presenter.toPublicUser(user);
}

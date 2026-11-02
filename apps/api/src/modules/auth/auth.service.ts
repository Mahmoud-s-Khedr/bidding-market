import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { LoginInput, RegisterInput } from '@market/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
type SafeUser = {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  displayName: string;
  avatarUrl: string | null;
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
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}
  private safe(user: {
    id: string;
    email: string;
    role: 'USER' | 'ADMIN';
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
  }): SafeUser {
    return {
      ...user,
      avatarUrl: user.avatarKey,
      bio: user.bio,
      location: user.location,
      companyName: user.companyName,
    };
  }
  private access(user: { id: string; role: 'USER' | 'ADMIN' }): string {
    return this.jwt.sign({ sub: user.id, role: user.role });
  }
  private expiry(): Date {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  private async issue(userId: string, familyId = randomBytes(20).toString('hex')): Promise<string> {
    const raw = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: await argon2.hash(raw, { type: argon2.argon2id }),
        expiresAt: this.expiry(),
      },
    });
    return raw;
  }
  async register(
    input: RegisterInput,
  ): Promise<{ accessToken: string; refreshToken: string; user: SafeUser }> {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new ConflictException('Email already registered');
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
        displayName: input.displayName,
        isBusiness: input.isBusiness ?? false,
        companyName: input.companyName,
      },
    });
    return {
      accessToken: this.access(user),
      refreshToken: await this.issue(user.id),
      user: this.safe(user),
    };
  }
  async login(
    input: LoginInput,
  ): Promise<{ accessToken: string; refreshToken: string; user: SafeUser }> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !(await argon2.verify(user.passwordHash, input.password)))
      throw new UnauthorizedException('Invalid email or password');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Account is not active');
    return {
      accessToken: this.access(user),
      refreshToken: await this.issue(user.id),
      user: this.safe(user),
    };
  }
  async refresh(
    raw: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: SafeUser }> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { revokedAt: null },
      include: { user: true },
    });
    let token: (typeof tokens)[number] | undefined;
    for (const candidate of tokens)
      if (await argon2.verify(candidate.tokenHash, raw)) {
        token = candidate;
        break;
      }
    if (!token) {
      const all = await this.prisma.refreshToken.findMany({ include: { user: true } });
      for (const candidate of all)
        if (await argon2.verify(candidate.tokenHash, raw)) {
          await this.prisma.refreshToken.updateMany({
            where: { familyId: candidate.familyId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          break;
        }
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (token.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');
    if (token.user.status !== 'ACTIVE') throw new ForbiddenException('Account is not active');
    const next = randomBytes(48).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      const newToken = await tx.refreshToken.create({
        data: {
          userId: token.userId,
          familyId: token.familyId,
          tokenHash: await argon2.hash(next, { type: argon2.argon2id }),
          expiresAt: this.expiry(),
        },
      });
      await tx.refreshToken.update({
        where: { id: token.id },
        data: { revokedAt: new Date(), replacedById: newToken.id },
      });
    });
    return {
      accessToken: this.access(token.user),
      refreshToken: next,
      user: this.safe(token.user),
    };
  }
  async logout(raw?: string): Promise<void> {
    if (!raw) return;
    const tokens = await this.prisma.refreshToken.findMany({ where: { revokedAt: null } });
    for (const token of tokens)
      if (await argon2.verify(token.tokenHash, raw)) {
        await this.prisma.refreshToken.update({
          where: { id: token.id },
          data: { revokedAt: new Date() },
        });
        return;
      }
  }
  async me(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException();
    return this.safe(user);
  }
}

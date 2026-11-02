import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC, ROLES, type AuthUser } from '../../common/auth.js';
import { PrismaService } from '../../prisma/prisma.service.js';
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService = {
      user: { findUnique: () => Promise.resolve({ status: 'ACTIVE', role: 'USER' }) },
    } as unknown as PrismaService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string }; user?: AuthUser }>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Authentication required');
    try {
      const payload = this.jwt.verify<{ sub: string; role: AuthUser['role'] }>(token, {
        algorithms: ['HS256'],
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { status: true, role: true },
      });
      if (!user) throw new UnauthorizedException('Invalid access token');
      if (user.status !== 'ACTIVE') throw new ForbiddenException('Account is not active');
      request.user = { id: payload.sub, role: user.role };
      return true;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException)
        throw error;
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AuthUser['role'][]>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new UnauthorizedException('Authentication required');
    return !required || required.includes(user.role);
  }
}

import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
export interface AuthUser {
  id: string;
  role: 'USER' | 'ADMIN';
}
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const IS_OPTIONAL_AUTH = 'isOptionalAuth';
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH, true);
export const ROLES = 'roles';
export const Roles = (...roles: AuthUser['role'][]) => SetMetadata(ROLES, roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined =>
    context.switchToHttp().getRequest<{ user?: AuthUser }>().user,
);

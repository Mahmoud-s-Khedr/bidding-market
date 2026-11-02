export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl?: string | null;
  bio?: string | null;
  location?: string | null;
  isBusiness: boolean;
  companyName?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  completedCount?: number;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | (string & {});

export interface ApiErrorPayload {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

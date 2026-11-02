import { type ApiErrorCode, type ApiErrorPayload, type AuthResponse } from './types';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, code: ApiErrorCode = 'INTERNAL', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let inMemoryAccessToken: string | null = null;
let refreshPromise: Promise<AuthResponse | null> | null = null;
let authGeneration = 0;
const authListeners = new Set<(token: string | null) => void>();

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
  for (const listener of authListeners) {
    listener(token);
  }
}

export function getAuthGeneration(): number {
  return authGeneration;
}

/**
 * Increments auth generation counter to invalidate any in-flight refresh requests.
 */
export function bumpAuthGeneration(): number {
  refreshPromise = null;
  return ++authGeneration;
}

/**
 * Resets local auth state and cancels any pending refresh by incrementing the generation counter.
 */
export function clearAuthSession(): void {
  bumpAuthGeneration();
  setAccessToken(null);
}

export function subscribeAccessToken(listener: (token: string | null) => void): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export function getApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  return `${url.replace(/\/+$/, '')}/api/v1`;
}

/**
 * Checks whether a given URL belongs to the configured API origin.
 */
export function isApiUrl(urlStr: string): boolean {
  try {
    const baseOrigin = new URL(getApiBaseUrl()).origin;
    const targetOrigin = new URL(urlStr, baseOrigin).origin;
    return targetOrigin === baseOrigin;
  } catch {
    return false;
  }
}

/**
 * Checks whether an endpoint or URL matches an exact API path (e.g., '/auth/refresh' or '/api/v1/auth/refresh').
 */
export function isExactApiPath(urlOrEndpoint: string, expectedPath: string): boolean {
  try {
    let pathname: string;
    if (urlOrEndpoint.startsWith('http://') || urlOrEndpoint.startsWith('https://')) {
      pathname = new URL(urlOrEndpoint).pathname;
    } else {
      const withoutHash = urlOrEndpoint.split('#')[0] ?? '';
      pathname = withoutHash.split('?')[0] ?? '';
    }
    const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
    return normalized === expectedPath || normalized === `/api/v1${expectedPath}`;
  } catch {
    return false;
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
  retryOn401?: boolean;
}

export async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const {
    body,
    params,
    skipAuth = false,
    retryOn401 = true,
    headers: customHeaders,
    ...rest
  } = options;

  let url =
    endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${getApiBaseUrl()}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const isApi = isApiUrl(url);
  const sentToken = inMemoryAccessToken;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  // Security: only attach Bearer token to endpoints targeting the configured API base URL origin
  if (!skipAuth && sentToken && isApi) {
    headers['Authorization'] = `Bearer ${sentToken}`;
  }

  let finalBody: BodyInit | null | undefined = undefined;
  if (body !== undefined) {
    if (body instanceof FormData) {
      finalBody = body;
    } else {
      headers['Content-Type'] = 'application/json';
      finalBody = JSON.stringify(body);
    }
  }

  const response = await fetch(url, {
    credentials: isApi ? 'include' : 'same-origin',
    headers,
    body: finalBody,
    ...rest,
  });

  const isAuthRefresh = isExactApiPath(endpoint, '/auth/refresh');
  const isAuthLogin = isExactApiPath(endpoint, '/auth/login');
  const isAuthRegister = isExactApiPath(endpoint, '/auth/register');
  const isAuthLogout = isExactApiPath(endpoint, '/auth/logout');

  if (
    response.status === 401 &&
    retryOn401 &&
    isApi &&
    !isAuthRefresh &&
    !isAuthLogin &&
    !isAuthRegister &&
    !isAuthLogout
  ) {
    // Late-401 race condition check:
    // If another request already refreshed the access token while this request was in flight,
    // inMemoryAccessToken will differ from sentToken. We retry directly with the new token
    // without triggering a second refresh that would reuse a rotated cookie.
    if (inMemoryAccessToken && inMemoryAccessToken !== sentToken) {
      return request<T>(endpoint, {
        ...options,
        retryOn401: false,
      });
    }

    const authRes = await executeRefresh();
    if (authRes?.accessToken) {
      return request<T>(endpoint, {
        ...options,
        retryOn401: false,
      });
    }
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!response.ok) {
    if (isJson) {
      try {
        const errorJson = (await response.json()) as ApiErrorPayload;
        if (errorJson && errorJson.error && typeof errorJson.error === 'object') {
          throw new ApiError(
            response.status,
            errorJson.error.message || response.statusText,
            errorJson.error.code || 'INTERNAL',
            errorJson.error.details,
          );
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
      }
    }
    throw new ApiError(
      response.status,
      response.statusText || 'An unexpected error occurred',
      'INTERNAL',
    );
  }

  if (isJson) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

export async function executeRefresh(): Promise<AuthResponse | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const currentGen = authGeneration;

  let p: Promise<AuthResponse | null> | null = null;
  p = (async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        if (authGeneration === currentGen) {
          setAccessToken(null);
        }
        return null;
      }

      const data = (await res.json()) as AuthResponse;
      // Stale refresh check: discard if logout or auth reset occurred while in flight
      if (authGeneration === currentGen) {
        setAccessToken(data.accessToken);
        return data;
      }
      return null;
    } catch {
      if (authGeneration === currentGen) {
        setAccessToken(null);
      }
      return null;
    } finally {
      if (refreshPromise === p) {
        refreshPromise = null;
      }
    }
  })();

  refreshPromise = p;
  return refreshPromise;
}

export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { method: 'GET', ...options }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { method: 'POST', body, ...options }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { method: 'PATCH', body, ...options }),

  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { method: 'PUT', body, ...options }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { method: 'DELETE', ...options }),
};

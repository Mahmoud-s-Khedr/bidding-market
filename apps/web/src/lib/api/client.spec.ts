import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  api,
  ApiError,
  getAccessToken,
  setAccessToken,
  subscribeAccessToken,
  clearAuthSession,
  executeRefresh,
  request,
} from './client';

describe('API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearAuthSession();
  });

  it('correctly constructs ApiError with status, code, and details', () => {
    const error = new ApiError(404, 'Item not found', 'NOT_FOUND', { id: '123' });
    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Item not found');
    expect(error.details).toEqual({ id: '123' });
  });

  it('manages and subscribes to access token', () => {
    expect(getAccessToken()).toBeNull();
    const listener = vi.fn();
    const unsubscribe = subscribeAccessToken(listener);

    setAccessToken('test-token-123');
    expect(getAccessToken()).toBe('test-token-123');
    expect(listener).toHaveBeenCalledWith('test-token-123');

    unsubscribe();
    setAccessToken('new-token');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('attaches Bearer token header to outgoing requests targeting API base URL', async () => {
    setAccessToken('mock-access-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.get('/test-endpoint');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe('include');
    expect((options.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer mock-access-token',
    );
    expect(result).toEqual({ success: true });
  });

  it('strips/does not attach Bearer token to external origins', async () => {
    setAccessToken('mock-access-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ external: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.get('https://external-third-party.example/endpoint');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['Authorization']).toBeUndefined();
    expect(options.credentials).toBe('same-origin');
  });

  it('serializes request body to JSON and adds query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ id: '1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.post('/items', { name: 'Widget' }, { params: { active: true, count: 5 } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/items?active=true&count=5');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ name: 'Widget' }));
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('parses structured API errors into ApiError class', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input parameters',
            details: [{ field: 'email', message: 'Invalid email' }],
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/validate')).rejects.toThrow(ApiError);

    try {
      await api.get('/validate');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.code).toBe('VALIDATION_ERROR');
      expect(apiErr.message).toBe('Invalid input parameters');
      expect(apiErr.details).toEqual([{ field: 'email', message: 'Invalid email' }]);
    }
  });

  it('handles 204 No Content response gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.delete('/items/1');
    expect(result).toBeUndefined();
  });

  it('handles non-JSON error response fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: () => Promise.resolve('Gateway timeout'),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/fail')).rejects.toThrow('Internal Server Error');
  });

  it('retries once on 401 via single-flight refresh', async () => {
    setAccessToken('expired-token');

    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              accessToken: 'fresh-new-token',
              user: { id: 'user-1', email: 'test@example.com' },
            }),
        });
      }

      if (url.includes('/protected-resource')) {
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () =>
              Promise.resolve({
                error: { code: 'UNAUTHORIZED', message: 'Token expired' },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ secretData: 'success' }),
        });
      }

      return Promise.reject(new Error('Unknown url'));
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await api.get<{ secretData: string }>('/protected-resource');

    expect(result).toEqual({ secretData: 'success' });
    expect(getAccessToken()).toBe('fresh-new-token');
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1. initial 401, 2. /auth/refresh, 3. retried request
  });

  it('clears access token if refresh fails', async () => {
    setAccessToken('expired-token');

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              error: { code: 'UNAUTHORIZED', message: 'Session expired' },
            }),
        });
      }

      return Promise.resolve({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
          }),
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/secure')).rejects.toThrow('Unauthorized');
    expect(getAccessToken()).toBeNull();
  });

  it('coalesces multiple concurrent 401s into a single refresh request', async () => {
    setAccessToken('expired-token');
    let refreshCallCount = 0;

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCallCount++;
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () =>
                  Promise.resolve({
                    accessToken: 'shared-fresh-token',
                    user: { id: 'u1' },
                  }),
              }),
            10,
          ),
        );
      }

      return Promise.resolve({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            error: { code: 'UNAUTHORIZED', message: 'Token expired' },
          }),
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    // Launch 3 requests simultaneously
    const p1 = request('/endpoint-1');
    const p2 = request('/endpoint-2');
    const p3 = request('/endpoint-3');

    // All 3 encounter 401 initially and trigger refresh
    await Promise.allSettled([p1, p2, p3]);

    // Only one refresh request should have fired
    expect(refreshCallCount).toBe(1);
    expect(getAccessToken()).toBe('shared-fresh-token');
  });

  it('handles late-401 case by retrying with rotated token without calling executeRefresh again', async () => {
    setAccessToken('token-v1');
    let refreshCount = 0;

    let resolveRequestBInitial: (val: unknown) => void;
    const requestBInitialPromise = new Promise((resolve) => {
      resolveRequestBInitial = resolve;
    });

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;

      if (url.includes('/auth/refresh')) {
        refreshCount++;
        setAccessToken('token-v2');
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              accessToken: 'token-v2',
              user: { id: 'u1' },
            }),
        });
      }

      if (url.includes('/request-a')) {
        if (headers['Authorization'] === 'Bearer token-v1') {
          return Promise.resolve({
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ data: 'response-a' }),
        });
      }

      if (url.includes('/request-b')) {
        if (headers['Authorization'] === 'Bearer token-v1') {
          // Simulate late response arriving after Request A's refresh completed
          return requestBInitialPromise;
        }
        if (headers['Authorization'] === 'Bearer token-v2') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'response-b' }),
          });
        }
      }

      return Promise.reject(new Error(`Unexpected call to ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    // 1. Both request A and request B are dispatched with token-v1
    const promiseA = api.get('/request-a');
    const promiseB = api.get('/request-b');

    // 2. Request A gets 401, completes refresh (updates to token-v2) and retries successfully
    const resultA = await promiseA;
    expect(resultA).toEqual({ data: 'response-a' });
    expect(refreshCount).toBe(1);
    expect(getAccessToken()).toBe('token-v2');

    // 3. Now Request B's 401 finally arrives late (after refresh finished)
    resolveRequestBInitial!({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }),
    });

    const resultB = await promiseB;
    expect(resultB).toEqual({ data: 'response-b' });

    // Ensure refresh was NOT executed a second time (cookie rotation protection)
    expect(refreshCount).toBe(1);
  });

  it('uses exact path matching for /auth/refresh', async () => {
    setAccessToken('old-token');

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh') && !url.includes('query=')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ accessToken: 'new-token' }),
        });
      }

      if (url.includes('/search')) {
        const isRetried = getAccessToken() === 'new-token';
        if (!isRetried) {
          return Promise.resolve({
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED' } }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ searchResults: [] }),
        });
      }

      return Promise.resolve({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    // Endpoint containing '/auth/refresh' in query parameter should STILL refresh on 401
    const res = await api.get('/search', { params: { query: '/auth/refresh' } });
    expect(res).toEqual({ searchResults: [] });
    expect(getAccessToken()).toBe('new-token');
  });

  it('discards stale refresh result if clearAuthSession is called during in-flight refresh', async () => {
    let resolveRefresh: (val: unknown) => void;
    const refreshPending = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return refreshPending;
      }
      return Promise.reject(new Error('Unexpected'));
    });

    vi.stubGlobal('fetch', fetchMock);

    const refreshPromise = executeRefresh();

    // User logs out while refresh is in flight
    clearAuthSession();
    expect(getAccessToken()).toBeNull();

    // Refresh resolves after logout
    resolveRefresh!({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ accessToken: 'stale-token', user: { id: 'u1' } }),
    });

    const result = await refreshPromise;
    expect(result).toBeNull();
    // Stale token was discarded and not stored
    expect(getAccessToken()).toBeNull();
  });

  it('does not attempt refresh-on-401 for non-API external URLs', async () => {
    let refreshFired = false;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshFired = true;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ accessToken: 'new-token' }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ error: { message: 'External 401' } }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('https://external-service.example/data')).rejects.toThrow();
    expect(refreshFired).toBe(false);
  });

  it('only clears refreshPromise in finally if it is still the same promise', async () => {
    let resolveFirstRefresh: (val: unknown) => void;
    const firstRefreshPromise = new Promise((resolve) => {
      resolveFirstRefresh = resolve;
    });

    let refreshCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls++;
        if (refreshCalls === 1) {
          return firstRefreshPromise;
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ accessToken: 'token-2' }),
        });
      }
      return Promise.reject(new Error('Unknown'));
    });
    vi.stubGlobal('fetch', fetchMock);

    // Start first refresh
    const p1 = executeRefresh();

    // Session is cleared / bumped, resetting refreshPromise to null
    clearAuthSession();

    // Start second refresh before first finishes
    const p2 = executeRefresh();
    expect(p2).not.toBe(p1);

    // Now first refresh finally completes
    resolveFirstRefresh!({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED' } }),
    });
    await p1;

    // The second refresh promise should still be preserved and resolved
    const res2 = await p2;
    expect(res2?.accessToken).toBe('token-2');
  });

  it('supports put, patch, delete helpers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.put('/item/1', { a: 1 });
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PUT');

    await api.patch('/item/1', { b: 2 });
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('PATCH');

    await api.delete('/item/1');
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('DELETE');
  });
});

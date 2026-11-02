import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  api,
  ApiError,
  getAccessToken,
  setAccessToken,
  subscribeAccessToken,
  request,
} from './client';

describe('API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAccessToken(null);
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

  it('attaches Bearer token header to outgoing requests', async () => {
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

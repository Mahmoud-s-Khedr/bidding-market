import { describe, it, expect } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext redirect helper', () => {
  it('allows safe relative paths', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard');
    expect(safeNext('/listings')).toBe('/listings');
    expect(safeNext('/listings/item-123?tab=bids&sort=asc#summary')).toBe(
      '/listings/item-123?tab=bids&sort=asc#summary',
    );
  });

  it('falls back to /dashboard for empty or missing inputs', () => {
    expect(safeNext(null)).toBe('/dashboard');
    expect(safeNext(undefined)).toBe('/dashboard');
    expect(safeNext('')).toBe('/dashboard');
    expect(safeNext('   ')).toBe('/dashboard');
  });

  it('rejects protocol-relative open redirect URLs', () => {
    expect(safeNext('//evil.com')).toBe('/dashboard');
    expect(safeNext('//evil.com/phish')).toBe('/dashboard');
    expect(safeNext('///evil.com')).toBe('/dashboard');
  });

  it('rejects normalized protocol-relative open redirect bypasses', () => {
    // Normalization turning path into //evil.example
    expect(safeNext('/foo/..//evil.example')).toBe('/dashboard');
    expect(safeNext('/..//evil.example')).toBe('/dashboard');
    expect(safeNext('/./..//evil.example')).toBe('/dashboard');
  });

  it('handles dot-slash space variants and encoded slashes without producing external redirects', () => {
    // /./ /evil style variants normalize to relative internal path
    const spaceRes = safeNext('/./ /evil');
    expect(spaceRes).toBe('/%20/evil');
    expect(spaceRes.startsWith('/')).toBe(true);
    expect(spaceRes.startsWith('//')).toBe(false);

    expect(safeNext('/./evil')).toBe('/evil');

    // Encoded slashes must not produce an external redirect
    const encodedRes = safeNext('/%2F%2Fevil.example');
    expect(encodedRes.startsWith('/')).toBe(true);
    expect(encodedRes.startsWith('//')).toBe(false);
    expect(encodedRes.startsWith('/\\')).toBe(false);
    expect(encodedRes).toBe('/%2F%2Fevil.example');
  });

  it('rejects absolute external URLs', () => {
    expect(safeNext('https://evil.com')).toBe('/dashboard');
    expect(safeNext('http://evil.com/login')).toBe('/dashboard');
    expect(safeNext('ftp://evil.com')).toBe('/dashboard');
  });

  it('rejects backslash open-redirect bypass tricks', () => {
    expect(safeNext('/\\evil.com')).toBe('/dashboard');
    expect(safeNext('/\\/evil.com')).toBe('/dashboard');
    expect(safeNext('\\evil.com')).toBe('/dashboard');
    expect(safeNext('/legit/path\\evil.com')).toBe('/dashboard');
  });

  it('rejects javascript and data URIs', () => {
    expect(safeNext('javascript:')).toBe('/dashboard');
    expect(safeNext('javascript:alert(1)')).toBe('/dashboard');
    expect(safeNext('data:text/html,<script>alert(1)</script>')).toBe('/dashboard');
    expect(safeNext('vbscript:msgbox')).toBe('/dashboard');
  });

  it('rejects control characters and CRLF injection', () => {
    expect(safeNext('/dashboard\r\nSet-Cookie: evil=true')).toBe('/dashboard');
    expect(safeNext('/dashboard\0evil')).toBe('/dashboard');
    expect(safeNext('/dashboard\x1bevil')).toBe('/dashboard');
  });

  it('respects a custom fallback if provided', () => {
    expect(safeNext('//evil.com', '/fallback-path')).toBe('/fallback-path');
    expect(safeNext('https://evil.com', '/')).toBe('/');
  });

  it('handles URL resolution failure or origin mismatch gracefully', () => {
    // Test URL throwing an exception
    const originalURL = globalThis.URL;
    try {
      // Mock URL constructor to throw
      globalThis.URL = class extends originalURL {
        constructor(url: string | URL, base?: string | URL) {
          if (typeof url === 'string' && url.includes('throw-error')) {
            throw new Error('Invalid URL');
          }
          super(url, base);
        }
      };

      expect(safeNext('/throw-error')).toBe('/dashboard');
    } finally {
      globalThis.URL = originalURL;
    }
  });

  it('checks base origin when window.location is defined', () => {
    const originalOrigin = window.location.origin;
    try {
      Object.defineProperty(window, 'origin', {
        value: 'http://my-marketplace.test',
        configurable: true,
      });

      expect(safeNext('/dashboard')).toBe('/dashboard');
    } finally {
      Object.defineProperty(window, 'origin', {
        value: originalOrigin,
        configurable: true,
      });
    }
  });
});

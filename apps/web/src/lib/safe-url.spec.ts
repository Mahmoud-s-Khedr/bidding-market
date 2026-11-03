import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeMediaUrl } from './safe-url';

describe('safeMediaUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects null, undefined, empty, and non-string inputs', () => {
    expect(safeMediaUrl(null)).toBeUndefined();
    expect(safeMediaUrl(undefined)).toBeUndefined();
    expect(safeMediaUrl('')).toBeUndefined();
    expect(safeMediaUrl('   ')).toBeUndefined();
    // @ts-expect-error - testing invalid runtime types
    expect(safeMediaUrl(123)).toBeUndefined();
    // @ts-expect-error - testing invalid runtime types
    expect(safeMediaUrl({})).toBeUndefined();
  });

  it('rejects javascript: URLs including whitespace and mixed case', () => {
    expect(safeMediaUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeMediaUrl('javascript:void(0)')).toBeUndefined();
    expect(safeMediaUrl('JaVaScRiPt:alert(1)')).toBeUndefined();
    expect(safeMediaUrl('JAVASCRIPT:alert(1)')).toBeUndefined();
    expect(safeMediaUrl('  javascript:alert(1)')).toBeUndefined();
    expect(safeMediaUrl('\tjavascript:alert(1)')).toBeUndefined();
    expect(safeMediaUrl('\njavascript:alert(1)')).toBeUndefined();
    expect(safeMediaUrl('  JaVaScRiPt:alert(1)  ')).toBeUndefined();
  });

  it('rejects data:text/html and arbitrary data: URLs', () => {
    expect(safeMediaUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(
      safeMediaUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='),
    ).toBeUndefined();
    expect(safeMediaUrl('DaTa:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeMediaUrl('DATA:text/plain;charset=utf-8,malicious')).toBeUndefined();
    expect(safeMediaUrl('  data:text/html,test  ')).toBeUndefined();
  });

  it('rejects vbscript: URLs with variations', () => {
    expect(safeMediaUrl('vbscript:msgbox(1)')).toBeUndefined();
    expect(safeMediaUrl('VbScRiPt:msgbox(1)')).toBeUndefined();
    expect(safeMediaUrl('VBSCRIPT:alert(1)')).toBeUndefined();
    expect(safeMediaUrl('  vbscript:msgbox(1)  ')).toBeUndefined();
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeMediaUrl('//evil.com/pic.png')).toBeUndefined();
    expect(safeMediaUrl('//localhost:4000/pic.png')).toBeUndefined();
    expect(safeMediaUrl('  //evil.com/pic.png  ')).toBeUndefined();
    expect(safeMediaUrl('/\\evil.com/pic.png')).toBeUndefined();
  });

  it('rejects unsupported or unsafe schemes and malformed URLs', () => {
    expect(safeMediaUrl('ftp://example.com/pic.png')).toBeUndefined();
    expect(safeMediaUrl('file:///etc/passwd')).toBeUndefined();
    expect(safeMediaUrl('gopher://example.com')).toBeUndefined();
    expect(safeMediaUrl('just-a-string')).toBeUndefined();
    expect(safeMediaUrl('/relative/path/image.png')).toBeUndefined();
  });

  it('rejects malicious blob: payload schemes', () => {
    expect(safeMediaUrl('blob:javascript:alert(1)')).toBeUndefined();
    expect(safeMediaUrl('blob:data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeMediaUrl('blob:vbscript:msgbox(1)')).toBeUndefined();
  });

  it('allows safe blob: URLs created via URL.createObjectURL', () => {
    expect(safeMediaUrl('blob:http://localhost:3000/550e8400-e29b-41d4-a716-446655440000')).toBe(
      'blob:http://localhost:3000/550e8400-e29b-41d4-a716-446655440000',
    );
    expect(safeMediaUrl('blob:https://market.test/8b7d8d2e-4b47-4929-a111-92576b539bf3')).toBe(
      'blob:https://market.test/8b7d8d2e-4b47-4929-a111-92576b539bf3',
    );
    expect(safeMediaUrl('BLOB:http://localhost:3000/preview')).toBe(
      'blob:http://localhost:3000/preview',
    );
    expect(safeMediaUrl('blob:preview-url')).toBe('blob:preview-url');
    expect(safeMediaUrl('  blob:preview-url  ')).toBe('blob:preview-url');
  });

  it('allows valid https: URLs and normalizes whitespace/casing', () => {
    expect(safeMediaUrl('https://example.com/images/cat.jpg')).toBe(
      'https://example.com/images/cat.jpg',
    );
    expect(safeMediaUrl('HTTPS://EXAMPLE.COM/IMAGES/CAT.JPG')).toBe(
      'https://example.com/IMAGES/CAT.JPG',
    );
    expect(safeMediaUrl('   https://example.com/images/cat.jpg   ')).toBe(
      'https://example.com/images/cat.jpg',
    );
    expect(safeMediaUrl('https://s3.amazonaws.com/bucket/uploads/file.pdf')).toBe(
      'https://s3.amazonaws.com/bucket/uploads/file.pdf',
    );
  });

  it('allows http: URLs only for configured API/storage host in dev', () => {
    // Default dev origins: localhost:4000 and localhost:8333 (and 127.0.0.1 equivalents)
    expect(safeMediaUrl('http://localhost:4000/uploads/file.png')).toBe(
      'http://localhost:4000/uploads/file.png',
    );
    expect(safeMediaUrl('http://127.0.0.1:4000/uploads/file.png')).toBe(
      'http://127.0.0.1:4000/uploads/file.png',
    );
    expect(safeMediaUrl('http://localhost:8333/market-uploads/photo.jpg')).toBe(
      'http://localhost:8333/market-uploads/photo.jpg',
    );
    expect(safeMediaUrl('http://127.0.0.1:8333/market-uploads/photo.jpg')).toBe(
      'http://127.0.0.1:8333/market-uploads/photo.jpg',
    );

    // Mixed case scheme for dev host
    expect(safeMediaUrl('HTTP://localhost:4000/uploads/file.png')).toBe(
      'http://localhost:4000/uploads/file.png',
    );

    // Unconfigured host in dev is rejected
    expect(safeMediaUrl('http://evil.com/photo.jpg')).toBeUndefined();
    expect(safeMediaUrl('http://attacker.local:4000/photo.jpg')).toBeUndefined();
    expect(safeMediaUrl('http://example.com/uploads/file.png')).toBeUndefined();
  });

  it('respects custom configured hosts via options or env in dev', () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://api.staging.local:8080';
    process.env.NEXT_PUBLIC_STORAGE_URL = 'http://minio.staging.local:9000';

    expect(safeMediaUrl('http://api.staging.local:8080/media/1.png')).toBe(
      'http://api.staging.local:8080/media/1.png',
    );
    expect(safeMediaUrl('http://minio.staging.local:9000/bucket/1.png')).toBe(
      'http://minio.staging.local:9000/bucket/1.png',
    );

    // Test 127.0.0.1 candidate expanding to localhost
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:9090';
    expect(safeMediaUrl('http://localhost:9090/media/test.png')).toBe(
      'http://localhost:9090/media/test.png',
    );

    // Test invalid candidate URL does not crash host resolution
    process.env.NEXT_PUBLIC_API_URL = ':::not-a-valid-url:::';
    expect(safeMediaUrl('http://localhost:4000/uploads/file.png')).toBe(
      'http://localhost:4000/uploads/file.png',
    );

    // Options override
    expect(
      safeMediaUrl('http://custom-host:5000/img.png', {
        isDev: true,
        allowedHosts: ['custom-host:5000'],
      }),
    ).toBe('http://custom-host:5000/img.png');
  });

  it('rejects all http: URLs when in production mode', () => {
    vi.stubEnv('NODE_ENV', 'production');

    // In production, even configured localhost origins are rejected over http
    expect(safeMediaUrl('http://localhost:4000/uploads/file.png')).toBeUndefined();
    expect(safeMediaUrl('http://localhost:8333/market-uploads/photo.jpg')).toBeUndefined();
    expect(safeMediaUrl('http://evil.com/photo.jpg')).toBeUndefined();

    // https: and blob: remain allowed in production
    expect(safeMediaUrl('https://cdn.example.com/image.png')).toBe(
      'https://cdn.example.com/image.png',
    );
    expect(safeMediaUrl('blob:http://localhost:3000/preview')).toBe(
      'blob:http://localhost:3000/preview',
    );

    // Explicit options isDev: false
    expect(
      safeMediaUrl('http://localhost:4000/uploads/file.png', {
        isDev: false,
      }),
    ).toBeUndefined();
  });
});

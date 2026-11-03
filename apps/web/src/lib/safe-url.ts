/**
 * Resolves allowed development hosts from environment variables or defaults.
 */
function getDevAllowedHosts(customHosts?: string[]): Set<string> {
  const hosts = new Set<string>();

  if (customHosts) {
    for (const h of customHosts) {
      hosts.add(h.toLowerCase());
    }
    return hosts;
  }

  const candidateUrls = [
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    process.env.NEXT_PUBLIC_STORAGE_URL,
    process.env.S3_ENDPOINT || 'http://localhost:8333',
  ];

  for (const rawUrl of candidateUrls) {
    if (!rawUrl) continue;
    try {
      const u = new URL(rawUrl);
      hosts.add(u.host.toLowerCase());
      if (u.hostname === 'localhost') {
        hosts.add(`127.0.0.1${u.port ? `:${u.port}` : ''}`);
      } else if (u.hostname === '127.0.0.1') {
        hosts.add(`localhost${u.port ? `:${u.port}` : ''}`);
      }
    } catch {
      // Ignore invalid candidates
    }
  }

  // Always ensure default dev origins are present
  hosts.add('localhost:4000');
  hosts.add('127.0.0.1:4000');
  hosts.add('localhost:8333');
  hosts.add('127.0.0.1:8333');

  return hosts;
}

export interface SafeMediaUrlOptions {
  isDev?: boolean;
  allowedHosts?: string[];
}

/**
 * Validates user/DOM-provided media URLs (images, audio, downloads, etc.)
 * to prevent XSS (such as javascript:, data:text/html, vbscript:).
 *
 * Allowed protocols:
 * - blob: (local object URLs)
 * - https: (secure remote media)
 * - http: (only in dev when host matches configured API/storage origin)
 *
 * Returns the normalized URL if safe, or undefined otherwise.
 */
export function safeMediaUrl(
  url: string | null | undefined,
  options?: SafeMediaUrlOptions,
): string | undefined {
  if (!url || typeof url !== 'string') {
    return undefined;
  }

  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  const protocol = parsed.protocol.toLowerCase();

  // Explicit allowlist check recognized by CodeQL
  if (protocol !== 'blob:' && protocol !== 'https:' && protocol !== 'http:') {
    return undefined;
  }

  if (protocol === 'blob:') {
    const lowerPath = parsed.pathname.toLowerCase();
    if (
      lowerPath.startsWith('javascript:') ||
      lowerPath.startsWith('vbscript:') ||
      lowerPath.startsWith('data:')
    ) {
      return undefined;
    }
    return parsed.href;
  }

  if (protocol === 'https:') {
    return parsed.href;
  }

  if (protocol === 'http:') {
    const isDev = options?.isDev ?? process.env.NODE_ENV !== 'production';
    if (!isDev) {
      return undefined;
    }

    const allowedHosts = getDevAllowedHosts(options?.allowedHosts);
    if (allowedHosts.has(parsed.host.toLowerCase())) {
      return parsed.href;
    }
    return undefined;
  }

  return undefined;
}

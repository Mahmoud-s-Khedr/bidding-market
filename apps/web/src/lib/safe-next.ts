/**
 * Validates a redirect target URL to prevent post-login open redirect vulnerabilities.
 * Only relative paths starting with a single '/' are allowed.
 * Prevents protocol-relative URLs (//), backslash tricks (/\ or \), schemes (e.g. javascript:),
 * and control characters.
 *
 * @param raw The raw URL parameter from query string
 * @param fallback The fallback path if the URL is invalid or unsafe (default: '/dashboard')
 * @returns Safe relative redirect path
 */
export function safeNext(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw || typeof raw !== 'string') {
    return fallback;
  }

  const trimmed = raw.trim();

  // Must start with exactly one '/' and must not start with '//' or '/\'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }

  // Reject any backslashes anywhere in the path (e.g., /foo\bar or /evil.com)
  if (trimmed.includes('\\')) {
    return fallback;
  }

  // Reject ASCII control characters (0x00-0x1F, 0x7F)
  // eslint-disable-next-line no-control-regex -- explicitly matching ASCII control characters to reject header/URI injection
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return fallback;
  }

  try {
    const baseOrigin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';

    const parsed = new URL(trimmed, baseOrigin);

    // Ensure origin matches base origin exactly
    if (parsed.origin !== baseOrigin) {
      return fallback;
    }

    // Must be http or https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }

    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    // Re-validate the normalized result: it must start with exactly one '/' and not '//' or '/\'
    if (
      !normalized.startsWith('/') ||
      normalized.startsWith('//') ||
      normalized.startsWith('/\\')
    ) {
      return fallback;
    }

    return normalized;
  } catch {
    return fallback;
  }
}

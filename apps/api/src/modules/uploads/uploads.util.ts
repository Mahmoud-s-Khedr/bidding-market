import crypto from 'node:crypto';

export function sanitizeFileName(original: string, maxLength = 100): string {
  let clean = original
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
  clean = clean.split(/[/\\]/).filter(Boolean).pop() ?? 'file';
  clean = clean.replace(/^\.+/, '');
  clean = clean.replace(/[^a-zA-Z0-9._-]/g, '_');
  clean = clean.replace(/_+/g, '_');
  if (!clean || clean === '.') {
    clean = 'file';
  }
  if (clean.length > maxLength) {
    const dotIndex = clean.lastIndexOf('.');
    if (dotIndex > 0 && dotIndex > clean.length - 15) {
      const ext = clean.slice(dotIndex);
      const name = clean.slice(0, maxLength - ext.length);
      clean = `${name}${ext}`;
    } else {
      clean = clean.slice(0, maxLength);
    }
  }
  return clean;
}

export function generateCuid(): string {
  return 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatFileSize,
  formatMoney,
  formatRelativeTime,
  getCurrencySymbol,
} from './format';

describe('Format utilities', () => {
  describe('formatMoney', () => {
    it('formats minor units (cents) to USD currency correctly', () => {
      expect(formatMoney(1500, 'USD')).toBe('$15');
      expect(formatMoney(1550, 'USD')).toBe('$15.50');
      expect(formatMoney(0, 'USD')).toBe('$0');
      expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
    });

    it('formats other currencies', () => {
      expect(formatMoney(2500, 'EUR')).toContain('25');
      expect(formatMoney(5000, 'GBP')).toContain('50');
    });

    it('handles negative cents', () => {
      expect(formatMoney(-500, 'USD')).toBe('-$5');
    });
  });

  describe('getCurrencySymbol', () => {
    it('returns standard symbols for common currencies', () => {
      expect(getCurrencySymbol('USD')).toBe('$');
      expect(getCurrencySymbol('EUR')).toBe('€');
      expect(getCurrencySymbol('GBP')).toBe('£');
    });

    it('falls back to currency code for unknown currencies', () => {
      expect(getCurrencySymbol('XYZ')).toBe('XYZ');
    });
  });

  describe('formatRelativeTime', () => {
    it('formats recent timestamps as just now', () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe('just now');
    });

    it('formats minutes, hours, days ago', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinutesAgo)).toBe('5 minutes ago');

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoHoursAgo)).toBe('2 hours ago');

      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeDaysAgo)).toBe('3 days ago');
    });

    it('returns empty string for invalid dates', () => {
      expect(formatRelativeTime('invalid-date')).toBe('');
    });
  });

  describe('formatDate', () => {
    it('formats valid ISO date strings to human-readable format', () => {
      const formatted = formatDate('2026-05-15T12:00:00Z');
      expect(formatted).toContain('2026');
      expect(formatted).toContain('May');
      expect(formatted).toContain('15');
    });

    it('returns empty string for invalid date inputs', () => {
      expect(formatDate('invalid')).toBe('');
    });
  });

  describe('formatFileSize', () => {
    it('formats 0 or negative bytes as 0 B', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(-10)).toBe('0 B');
    });

    it('formats bytes under 1KB', () => {
      expect(formatFileSize(512)).toBe('512 B');
    });

    it('formats bytes under 1MB as KB', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(2048)).toBe('2.0 KB');
    });

    it('formats bytes 1MB and above as MB', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    });
  });
});

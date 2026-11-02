import { describe, expect, it } from 'vitest';
import { parseDurationMs } from './duration.js';

describe('parseDurationMs', () => {
  it('parses days, hours, and minutes correctly', () => {
    expect(parseDurationMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDurationMs('12h')).toBe(12 * 60 * 60 * 1000);
    expect(parseDurationMs('30m')).toBe(30 * 60 * 1000);
  });

  it('parses weeks, seconds, and milliseconds', () => {
    expect(parseDurationMs('2w')).toBe(2 * 7 * 24 * 60 * 60 * 1000);
    expect(parseDurationMs('45s')).toBe(45 * 1000);
    expect(parseDurationMs('500ms')).toBe(500);
    expect(parseDurationMs('1000')).toBe(1000);
  });

  it('trims leading and trailing whitespace', () => {
    expect(parseDurationMs('  7d  ')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDurationMs('\t12h\n')).toBe(12 * 60 * 60 * 1000);
  });

  it('throws on non-string input', () => {
    expect(() => parseDurationMs(null as never)).toThrow(TypeError);
    expect(() => parseDurationMs(undefined as never)).toThrow(TypeError);
    expect(() => parseDurationMs(123 as never)).toThrow(TypeError);
  });

  it('throws on invalid duration formats', () => {
    expect(() => parseDurationMs('')).toThrow(/Invalid duration format/);
    expect(() => parseDurationMs('abc')).toThrow(/Invalid duration format/);
    expect(() => parseDurationMs('7x')).toThrow(/Invalid duration format/);
    expect(() => parseDurationMs('-5m')).toThrow(/Invalid duration format/);
    expect(() => parseDurationMs('d')).toThrow(/Invalid duration format/);
  });
});

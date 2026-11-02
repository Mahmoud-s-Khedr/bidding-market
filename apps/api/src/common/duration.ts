const DURATION_REGEX = /^(\d+)(ms|s|m|h|d|w)?$/;

export function parseDurationMs(duration: string): number {
  if (typeof duration !== 'string') {
    throw new TypeError(`Duration must be a string, got ${typeof duration}`);
  }
  const trimmed = duration.trim();
  const match = DURATION_REGEX.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid duration format: "${duration}"`);
  }
  const rawValue = match[1];
  if (!rawValue) {
    throw new Error(`Invalid duration format: "${duration}"`);
  }
  const value = Number.parseInt(rawValue, 10);
  if (value < 0 || !Number.isFinite(value)) {
    throw new Error(`Duration must be a non-negative finite number: "${duration}"`);
  }
  const unit = match[2] ?? 'ms';
  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    case 'w':
      return value * 7 * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unsupported duration unit: "${unit}"`);
  }
}

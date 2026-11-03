export function formatMoney(amountCents: number, currency = 'USD'): string {
  const major = amountCents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
      minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

export function getCurrencySymbol(currency = 'USD'): string {
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
      currencyDisplay: 'symbol',
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === 'currency')?.value;
    return sym || currency;
  } catch {
    return currency;
  }
}

export function formatRelativeTime(dateInput: string | Date | number): string {
  const date = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  const now = Date.now();
  const diffSec = Math.round((date.getTime() - now) / 1000);
  const absDiffSec = Math.abs(diffSec);

  try {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    if (absDiffSec < 60) {
      return 'just now';
    }
    const diffMin = Math.round(diffSec / 60);
    if (Math.abs(diffMin) < 60) {
      return rtf.format(diffMin, 'minute');
    }
    const diffHours = Math.round(diffMin / 60);
    if (Math.abs(diffHours) < 24) {
      return rtf.format(diffHours, 'hour');
    }
    const diffDays = Math.round(diffHours / 24);
    if (Math.abs(diffDays) < 30) {
      return rtf.format(diffDays, 'day');
    }
    const diffMonths = Math.round(diffDays / 30);
    if (Math.abs(diffMonths) < 12) {
      return rtf.format(diffMonths, 'month');
    }
    const diffYears = Math.round(diffDays / 365);
    return rtf.format(diffYears, 'year');
  } catch {
    return date.toLocaleDateString();
  }
}

export function formatDate(dateInput: string | Date | number): string {
  const date = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

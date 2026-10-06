/**
 * Time utility for Aegis.
 * Aegis stores all dates in UTC and formats for Africa/Lagos (WAT, UTC+1).
 */

export const WAT_TIMEZONE = 'Africa/Lagos';

/**
 * Returns formatted WAT time string: "YYYY-MM-DD HH:mm:ss WAT"
 */
export function formatWAT(date: Date | string | number): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: WAT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d) + ' WAT';
}

/**
 * Formats a short time string (e.g. "14:35 WAT") for SMS templates.
 */
export function formatWATShortTime(date: Date | string | number): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: WAT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d) + ' WAT';
}

/**
 * Masks sensitive Nigerian phone numbers for NDPR compliance.
 * Example: +2348012345678 -> +234801•••5678
 *          08012345678    -> 0801•••5678
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const clean = phone.trim();
  if (clean.length < 8) return '••••••';

  // Keep first 7 characters (e.g. +234801 or 080123) and last 4 characters
  const prefix = clean.slice(0, Math.min(7, clean.length - 4));
  const suffix = clean.slice(-4);
  return `${prefix}•••${suffix}`;
}

/**
 * Masks arbitrary text for safe logging (e.g., alert bodies, tokens).
 */
export function maskText(text: string | null | undefined, keepChars = 4): string {
  if (!text) return '';
  if (text.length <= keepChars * 2) return '••••••';
  return `${text.slice(0, keepChars)}••••••${text.slice(-keepChars)}`;
}

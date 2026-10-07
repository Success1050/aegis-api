import { BadRequestException } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export type NigerianCarrier = 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE' | 'UNKNOWN';

const CARRIER_PREFIX_MAP: Record<NigerianCarrier, string[]> = {
  MTN: [
    '0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814',
    '0903', '0906', '0913', '0916', '07025', '07026', '0704',
  ],
  GLO: ['0805', '0807', '0705', '0815', '0811', '0905', '0915'],
  AIRTEL: [
    '0802', '0808', '0708', '0812', '0701', '0902', '0901', '0907',
    '0912', '0904',
  ],
  '9MOBILE': ['0809', '0818', '0817', '0909', '0908'],
  UNKNOWN: [],
};

/**
 * Normalizes any valid Nigerian phone string into strict E.164 standard (+234...).
 * Accepts 080..., 234..., +234..., with or without spaces/dashes.
 */
export function normalizeNigerianPhone(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new BadRequestException('Phone number is required.');
  }

  const raw = input.trim();
  const parsed = parsePhoneNumberFromString(raw, 'NG');
  if (parsed && parsed.isValid() && parsed.country === 'NG') {
    const formatted = parsed.format('E.164');
    if (formatted.length === 14) {
      return formatted;
    }
  }

  // Fallback cleanup for common local Nigerian formats
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.substring(1)}`;
  }
  if (digits.startsWith('234') && digits.length === 13) {
    return `+${digits}`;
  }
  if (raw.startsWith('+234') && raw.length === 14) {
    return raw;
  }

  throw new BadRequestException(
    `Invalid Nigerian phone number "${input}". Must be a valid 11-digit local or E.164 (+234...) number.`,
  );
}

/**
 * Identifies the telecommunications carrier for a Nigerian phone number.
 */
export function detectNigerianCarrier(phone: string): NigerianCarrier {
  try {
    const normalized = normalizeNigerianPhone(phone);
    // Convert +234803... into local prefix 0803...
    const local = `0${normalized.slice(4, 7)}`;
    const local5 = `0${normalized.slice(4, 8)}`;

    for (const [carrier, prefixes] of Object.entries(CARRIER_PREFIX_MAP)) {
      if (carrier === 'UNKNOWN') continue;
      if (prefixes.includes(local) || prefixes.includes(local5)) {
        return carrier as NigerianCarrier;
      }
    }
  } catch {
    return 'UNKNOWN';
  }

  return 'UNKNOWN';
}

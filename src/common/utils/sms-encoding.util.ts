export type SmsEncoding = 'GSM-7' | 'UCS-2';

export interface SmsSegmentAnalysis {
  encoding: SmsEncoding;
  characterCount: number;
  segmentCount: number;
  hasDiacritics: boolean;
  hasEmojis: boolean;
  warning?: string;
}

// GSM 03.38 standard character set
const GSM7_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);

// GSM 03.38 extension characters (each counts as 2 characters in GSM-7)
const GSM7_EXTENDED = new Set('^{}\\[~]|€');

// Hausa diacritic replacement mapping
const HAUSA_DIACRITICS_MAP: Record<string, string> = {
  ɓ: 'b',
  Ɓ: 'B',
  ɗ: 'd',
  Ɗ: 'D',
  ƙ: 'k',
  Ƙ: 'K',
  ƴ: 'y',
  Ƴ: 'Y',
};

/**
 * Normalizes alert message for Nigerian SMS transmission:
 * - Strips emojis
 * - Replaces curly/smart quotes with standard ASCII
 * - Replaces em-dashes and en-dashes
 * - Transliterates Hausa hooked letters if preserveDiacritics is false to avoid UCS-2 cost blow-ups
 */
export function normalizeForSms(text: string, preserveDiacritics = false): string {
  if (!text) return '';

  let normalized = text;

  // 1. Hausa diacritic policy
  if (!preserveDiacritics) {
    for (const [char, replacement] of Object.entries(HAUSA_DIACRITICS_MAP)) {
      normalized = normalized.split(char).join(replacement);
    }
  }

  // 2. Normalize smart quotes and dashes to standard ASCII
  normalized = normalized
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...');

  // 3. Strip emojis and graphical pictographs
  normalized = normalized.replace(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu, '');

  // 4. Clean extra spaces
  return normalized.replace(/\s+/g, ' ').trim();
}

/**
 * Detects whether a message qualifies for 7-bit GSM-7 or forces 16-bit UCS-2 encoding.
 */
export function detectSmsEncoding(text: string): SmsEncoding {
  for (const char of text) {
    if (!GSM7_BASIC.has(char) && !GSM7_EXTENDED.has(char)) {
      return 'UCS-2';
    }
  }
  return 'GSM-7';
}

/**
 * Calculates characters and billable SMS segments for a given text.
 * GSM-7: 160 chars single, 153 chars multi-part.
 * UCS-2: 70 chars single, 67 chars multi-part.
 */
export function calculateSmsSegments(text: string): SmsSegmentAnalysis {
  const encoding = detectSmsEncoding(text);
  const hasDiacritics = /[ɓƁɗƊƙƘƴƳ]/u.test(text);
  const hasEmojis = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu.test(text);

  let charCount = 0;
  if (encoding === 'GSM-7') {
    for (const char of text) {
      charCount += GSM7_EXTENDED.has(char) ? 2 : 1;
    }
  } else {
    charCount = Array.from(text).length;
  }

  let segmentCount = 1;
  let warning: string | undefined;

  if (encoding === 'GSM-7') {
    if (charCount > 160) {
      segmentCount = Math.ceil(charCount / 153);
    }
  } else {
    // UCS-2
    if (charCount > 70) {
      segmentCount = Math.ceil(charCount / 67);
    }
    warning = hasDiacritics
      ? 'Message contains Hausa diacritics causing UCS-2 encoding (70 chars/segment limit).'
      : 'Message contains Unicode characters causing UCS-2 encoding (70 chars/segment limit).';
  }

  if (segmentCount > 1 && !warning) {
    warning = `Multi-part SMS: Message exceeds single SMS length (${segmentCount} segments).`;
  }

  return {
    encoding,
    characterCount: charCount,
    segmentCount,
    hasDiacritics,
    hasEmojis,
    warning,
  };
}

import {
  detectSmsEncoding,
  calculateSmsSegments,
  normalizeForSms,
} from './sms-encoding.util';

describe('SMS Encoding & Segment Analysis Utilities', () => {
  describe('detectSmsEncoding', () => {
    it('should detect GSM-7 standard character set', () => {
      expect(detectSmsEncoding('Hello World')).toBe('GSM-7');
      expect(detectSmsEncoding('AEGIS ALERT: Emergency incident 12345')).toBe('GSM-7');
      expect(detectSmsEncoding('!@#$%&*()_-+=:;,.?')).toBe('GSM-7');
    });

    it('should detect GSM-7 extended characters', () => {
      expect(detectSmsEncoding('Cost: €100 [Urgent]')).toBe('GSM-7');
    });

    it('should detect UCS-2 when non-GSM characters are present', () => {
      // Hausa hooked letters
      expect(detectSmsEncoding('Sanarwa ga ɓangarori')).toBe('UCS-2');
      // Emojis
      expect(detectSmsEncoding('Alert 🚨')).toBe('UCS-2');
      // Arabic / Cyrillic
      expect(detectSmsEncoding('مرحبا')).toBe('UCS-2');
    });
  });

  describe('calculateSmsSegments', () => {
    it('should calculate 1 segment for GSM-7 <= 160 characters', () => {
      const text = 'A'.repeat(160);
      const analysis = calculateSmsSegments(text);
      expect(analysis.encoding).toBe('GSM-7');
      expect(analysis.segmentCount).toBe(1);
      expect(analysis.characterCount).toBe(160);
    });

    it('should calculate 2 segments for GSM-7 text with 161 characters (153 limit/part)', () => {
      const text = 'A'.repeat(161);
      const analysis = calculateSmsSegments(text);
      expect(analysis.encoding).toBe('GSM-7');
      expect(analysis.segmentCount).toBe(2);
      expect(analysis.characterCount).toBe(161);
    });

    it('should calculate 3 segments for GSM-7 text with 307 characters', () => {
      // 153 * 2 = 306
      const text = 'A'.repeat(307);
      const analysis = calculateSmsSegments(text);
      expect(analysis.encoding).toBe('GSM-7');
      expect(analysis.segmentCount).toBe(3);
    });

    it('should count extended GSM-7 characters as 2 characters', () => {
      // € and [ and ] are extended
      const text = 'Cost is €50'; // 11 chars + 1 extra for € = 12 chars
      const analysis = calculateSmsSegments(text);
      expect(analysis.encoding).toBe('GSM-7');
      expect(analysis.characterCount).toBe(12);
    });

    it('should calculate 1 segment for UCS-2 <= 70 characters', () => {
      const text = 'Sanarwa ga ɓangarori'; // Contains ɓ
      const analysis = calculateSmsSegments(text);
      expect(analysis.encoding).toBe('UCS-2');
      expect(analysis.segmentCount).toBe(1);
      expect(analysis.hasDiacritics).toBe(true);
    });

    it('should calculate 2 segments for UCS-2 text with 71 characters (67 limit/part)', () => {
      const text = 'ɓ' + 'A'.repeat(70); // 71 chars UCS-2
      const analysis = calculateSmsSegments(text);
      expect(analysis.encoding).toBe('UCS-2');
      expect(analysis.segmentCount).toBe(2);
    });
  });

  describe('normalizeForSms', () => {
    it('should transliterate Hausa hooked letters when preserveDiacritics is false', () => {
      const hausa = 'Sanarwa ga ɓangarori: Kada a ɗauki ƙarar ba tare da bincike ba. Ƴan uwa ku kiyaye.';
      const normalized = normalizeForSms(hausa, false);

      expect(normalized).toContain('bangarori');
      expect(normalized).toContain('dauki');
      expect(normalized).toContain('karar');
      expect(normalized).toContain('Yan uwa');
      expect(detectSmsEncoding(normalized)).toBe('GSM-7');
    });

    it('should preserve Hausa hooked letters when preserveDiacritics is true', () => {
      const hausa = 'Sanarwa ga ɓangarori';
      const normalized = normalizeForSms(hausa, true);

      expect(normalized).toContain('ɓangarori');
      expect(detectSmsEncoding(normalized)).toBe('UCS-2');
    });

    it('should replace smart quotes and dashes with standard ASCII', () => {
      const smart = '“Alert”: ‘Notice’ — details…';
      const normalized = normalizeForSms(smart, false);

      expect(normalized).toBe('"Alert": \'Notice\' - details...');
      expect(detectSmsEncoding(normalized)).toBe('GSM-7');
    });

    it('should strip graphical emojis', () => {
      const withEmoji = '🚨 AEGIS ALERT 🏃 Stay indoors!';
      const normalized = normalizeForSms(withEmoji, false);

      expect(normalized).toBe('AEGIS ALERT Stay indoors!');
    });
  });
});

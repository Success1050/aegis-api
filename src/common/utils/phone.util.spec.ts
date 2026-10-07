import {
  normalizeNigerianPhone,
  detectNigerianCarrier,
} from './phone.util';
import { maskPhone } from './pii.util';

describe('Phone Utilities (Nigerian Carrier Support)', () => {
  describe('normalizeNigerianPhone', () => {
    it('should normalize local 11-digit format starting with 0', () => {
      expect(normalizeNigerianPhone('08031234567')).toBe('+2348031234567');
      expect(normalizeNigerianPhone('07051234567')).toBe('+2347051234567');
      expect(normalizeNigerianPhone('09091234567')).toBe('+2349091234567');
    });

    it('should normalize 10-digit format without leading 0', () => {
      expect(normalizeNigerianPhone('8031234567')).toBe('+2348031234567');
      expect(normalizeNigerianPhone('7011234567')).toBe('+2347011234567');
    });

    it('should normalize numbers with country code prefix without plus', () => {
      expect(normalizeNigerianPhone('2348031234567')).toBe('+2348031234567');
    });

    it('should preserve standard E.164 formatted number', () => {
      expect(normalizeNigerianPhone('+2348031234567')).toBe('+2348031234567');
    });

    it('should handle spaced and hyphenated formatting', () => {
      expect(normalizeNigerianPhone('+234 803 123 4567')).toBe('+2348031234567');
      expect(normalizeNigerianPhone('0803-123-4567')).toBe('+2348031234567');
    });

    it('should throw error for invalid numbers', () => {
      expect(() => normalizeNigerianPhone('')).toThrow();
      expect(() => normalizeNigerianPhone('12345')).toThrow();
      expect(() => normalizeNigerianPhone('+14155552671')).toThrow('Nigerian phone number');
      expect(() => normalizeNigerianPhone('08031234567890')).toThrow();
    });
  });

  describe('detectNigerianCarrier', () => {
    it('should detect MTN prefixes', () => {
      expect(detectNigerianCarrier('+2348031234567')).toBe('MTN');
      expect(detectNigerianCarrier('+2348061234567')).toBe('MTN');
      expect(detectNigerianCarrier('+2347031234567')).toBe('MTN');
      expect(detectNigerianCarrier('+2349031234567')).toBe('MTN');
    });

    it('should detect Airtel prefixes', () => {
      expect(detectNigerianCarrier('+2348021234567')).toBe('AIRTEL');
      expect(detectNigerianCarrier('+2348081234567')).toBe('AIRTEL');
      expect(detectNigerianCarrier('+2347081234567')).toBe('AIRTEL');
      expect(detectNigerianCarrier('+2349021234567')).toBe('AIRTEL');
    });

    it('should detect Globacom (Glo) prefixes', () => {
      expect(detectNigerianCarrier('+2348051234567')).toBe('GLO');
      expect(detectNigerianCarrier('+2348071234567')).toBe('GLO');
      expect(detectNigerianCarrier('+2347051234567')).toBe('GLO');
      expect(detectNigerianCarrier('+2349051234567')).toBe('GLO');
    });

    it('should detect 9mobile prefixes', () => {
      expect(detectNigerianCarrier('+2348091234567')).toBe('9MOBILE');
      expect(detectNigerianCarrier('+2348171234567')).toBe('9MOBILE');
      expect(detectNigerianCarrier('+2349091234567')).toBe('9MOBILE');
    });
  });

  describe('maskPhone', () => {
    it('should mask middle digits of Nigerian phone numbers', () => {
      const masked = maskPhone('+2348031234567');
      expect(masked).toBe('+234803•••4567');
    });

    it('should handle short or empty inputs gracefully', () => {
      expect(maskPhone('')).toBe('');
      expect(maskPhone('123')).toBe('••••••');
    });
  });
});

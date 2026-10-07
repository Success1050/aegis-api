import { Language, IncidentType } from '@prisma/client';
import {
  renderAlertTemplate,
  containsCoordinates,
  sanitizeAreaName,
} from './template-renderer';

describe('Multilingual Template Renderer', () => {
  describe('renderAlertTemplate', () => {
    it('should render English template with APPROVED review status', () => {
      const result = renderAlertTemplate({
        templateType: 'ALERT_VERIFIED_INCIDENT',
        language: Language.ENGLISH,
        incidentNumber: 'INC-000001',
        incidentType: IncidentType.POSSIBLE_INTRUSION,
        areaName: 'Maitama Zone A',
        time: '14:30',
      });

      expect(result.usedLanguage).toBe(Language.ENGLISH);
      expect(result.reviewStatus).toBe('APPROVED');
      expect(result.fallbackOccurred).toBe(false);
      expect(result.text).toContain('AEGIS ALERT [INC-000001]');
      expect(result.text).toContain('Possible Intrusion');
      expect(result.text).toContain('Maitama Zone A');
      expect(result.text).toContain('14:30');
    });

    it('should render Hausa template with APPROVED review status', () => {
      const result = renderAlertTemplate({
        templateType: 'ALERT_VERIFIED_INCIDENT',
        language: Language.HAUSA,
        incidentNumber: 'INC-000001',
        incidentType: IncidentType.POSSIBLE_INTRUSION,
        areaName: 'Maitama Zone A',
        time: '14:30',
      });

      expect(result.usedLanguage).toBe(Language.HAUSA);
      expect(result.reviewStatus).toBe('APPROVED');
      expect(result.fallbackOccurred).toBe(false);
      expect(result.text).toContain('SANARWAR AEGIS [INC-000001]');
      expect(result.text).toContain('Katsalandan / Baragada');
    });

    it('should fall back to English for unreviewed Igbo when allowUnreviewed is false', () => {
      const result = renderAlertTemplate({
        templateType: 'ALERT_VERIFIED_INCIDENT',
        language: Language.IGBO,
        incidentNumber: 'INC-000001',
        incidentType: IncidentType.POSSIBLE_INTRUSION,
        areaName: 'Maitama Zone A',
        allowUnreviewed: false,
      });

      expect(result.usedLanguage).toBe(Language.ENGLISH);
      expect(result.fallbackOccurred).toBe(true);
      expect(result.reviewStatus).toBe('APPROVED');
      expect(result.text).toContain('AEGIS ALERT [INC-000001]');
    });

    it('should render Igbo when allowUnreviewed is true with NEEDS_NATIVE_REVIEW status', () => {
      const result = renderAlertTemplate({
        templateType: 'ALERT_VERIFIED_INCIDENT',
        language: Language.IGBO,
        incidentNumber: 'INC-000001',
        incidentType: IncidentType.POSSIBLE_INTRUSION,
        areaName: 'Maitama Zone A',
        allowUnreviewed: true,
      });

      expect(result.usedLanguage).toBe(Language.IGBO);
      expect(result.fallbackOccurred).toBe(false);
      expect(result.reviewStatus).toBe('NEEDS_NATIVE_REVIEW');
      expect(result.text).toContain('NKWUKWU AEGIS');
    });

    it('should render ALL_CLEAR template', () => {
      const result = renderAlertTemplate({
        templateType: 'ALL_CLEAR',
        language: Language.ENGLISH,
        incidentNumber: 'INC-000001',
        incidentType: IncidentType.OTHER,
        areaName: 'Wuse II',
        time: '15:45',
      });

      expect(result.text).toContain('AEGIS UPDATE [INC-000001]');
      expect(result.text).toContain('All clear near Wuse II as of 15:45');
    });
  });

  describe('Coordinate Leakage Protection', () => {
    it('should detect raw coordinate strings', () => {
      expect(containsCoordinates('9.0765, 7.3985')).toBe(true);
      expect(containsCoordinates('lat: 9.0765, lng: 7.3985')).toBe(true);
      expect(containsCoordinates('Maitama Zone A')).toBe(false);
    });

    it('should throw an error if areaName contains raw coordinates', () => {
      expect(() => sanitizeAreaName('9.0765, 7.3985')).toThrow('Security violation');
      expect(() => sanitizeAreaName('lat 9.07, lng 7.39')).toThrow('Security violation');
      expect(sanitizeAreaName('Maitama Community')).toBe('Maitama Community');
    });

    it('should throw if rendered message leaks coordinates', () => {
      expect(() =>
        renderAlertTemplate({
          templateType: 'ALERT_VERIFIED_INCIDENT',
          language: Language.ENGLISH,
          incidentNumber: 'INC-000001',
          incidentType: IncidentType.POSSIBLE_INTRUSION,
          areaName: '9.0765, 7.3985',
        }),
      ).toThrow();
    });
  });
});

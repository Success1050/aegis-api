import { IncidentStatus } from '@prisma/client';
import { INCIDENT_TRANSITIONS } from './incident-transitions';

describe('Incident State Machine Transition Matrix', () => {
  function isValidTransition(from: IncidentStatus, to: IncidentStatus): boolean {
    const allowed = INCIDENT_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  describe('Valid State Transitions', () => {
    it('should allow PENDING_REVIEW -> VERIFIED', () => {
      expect(isValidTransition(IncidentStatus.PENDING_REVIEW, IncidentStatus.VERIFIED)).toBe(true);
    });

    it('should allow PENDING_REVIEW -> DISMISSED', () => {
      expect(isValidTransition(IncidentStatus.PENDING_REVIEW, IncidentStatus.DISMISSED)).toBe(true);
    });

    it('should allow VERIFIED -> ALERTING', () => {
      expect(isValidTransition(IncidentStatus.VERIFIED, IncidentStatus.ALERTING)).toBe(true);
    });

    it('should allow ALERTING -> ALERTS_SENT', () => {
      expect(isValidTransition(IncidentStatus.ALERTING, IncidentStatus.ALERTS_SENT)).toBe(true);
    });

    it('should allow ALERTING -> ALERTS_PARTIALLY_FAILED', () => {
      expect(isValidTransition(IncidentStatus.ALERTING, IncidentStatus.ALERTS_PARTIALLY_FAILED)).toBe(true);
    });

    it('should allow ALERTS_SENT -> RESOLVED', () => {
      expect(isValidTransition(IncidentStatus.ALERTS_SENT, IncidentStatus.RESOLVED)).toBe(true);
    });

    it('should allow ALERTS_PARTIALLY_FAILED -> RESOLVED', () => {
      expect(isValidTransition(IncidentStatus.ALERTS_PARTIALLY_FAILED, IncidentStatus.RESOLVED)).toBe(true);
    });

    it('should allow ALERTS_PARTIALLY_FAILED -> ALERTING (via manual retry)', () => {
      expect(isValidTransition(IncidentStatus.ALERTS_PARTIALLY_FAILED, IncidentStatus.ALERTING)).toBe(true);
    });
  });

  describe('Invalid & Terminal Transitions', () => {
    it('should disallow any transition out of terminal DISMISSED state (Fork Immutability)', () => {
      const allStatuses = Object.values(IncidentStatus);
      for (const target of allStatuses) {
        expect(isValidTransition(IncidentStatus.DISMISSED, target)).toBe(false);
      }
    });

    it('should disallow any transition out of terminal RESOLVED state', () => {
      const allStatuses = Object.values(IncidentStatus);
      for (const target of allStatuses) {
        expect(isValidTransition(IncidentStatus.RESOLVED, target)).toBe(false);
      }
    });

    it('should prevent skipping verification (PENDING_REVIEW directly to ALERTS_SENT)', () => {
      expect(isValidTransition(IncidentStatus.PENDING_REVIEW, IncidentStatus.ALERTS_SENT)).toBe(false);
    });

    it('should prevent illegal state rollback (ALERTING back to PENDING_REVIEW)', () => {
      expect(isValidTransition(IncidentStatus.ALERTING, IncidentStatus.PENDING_REVIEW)).toBe(false);
    });
  });
});

import { Severity, IncidentType } from '@prisma/client';
import { calculateIncidentRisk } from './risk.util';

describe('Risk Calculation Engine', () => {
  it('should calculate high risk score for CRITICAL intrusion with dense population', () => {
    const assessment = calculateIncidentRisk({
      severity: Severity.CRITICAL,
      type: IncidentType.POSSIBLE_INTRUSION,
      recipientCount: 600,
      activeIncidentsInZoneLast24h: 2,
    });

    expect(assessment.score).toBeGreaterThanOrEqual(80);
    expect(assessment.riskLevel).toBe(Severity.CRITICAL);
    expect(assessment.recommendation).toContain('Urgent priority dispatch');
  });

  it('should calculate low risk score for LOW severity routine incident', () => {
    const assessment = calculateIncidentRisk({
      severity: Severity.LOW,
      type: IncidentType.OTHER,
      recipientCount: 5,
      activeIncidentsInZoneLast24h: 0,
    });

    expect(assessment.score).toBeLessThan(35);
    expect(assessment.riskLevel).toBe(Severity.LOW);
    expect(assessment.recommendation).toContain('Low priority');
  });

  it('should ensure composite risk score is strictly bounded between 0 and 100', () => {
    const extremeMax = calculateIncidentRisk({
      severity: Severity.CRITICAL,
      type: IncidentType.FIRE,
      recipientCount: 10000,
      activeIncidentsInZoneLast24h: 10,
    });

    expect(extremeMax.score).toBeLessThanOrEqual(100);
    expect(extremeMax.score).toBeGreaterThanOrEqual(0);

    const extremeMin = calculateIncidentRisk({
      severity: Severity.LOW,
      type: IncidentType.OTHER,
      recipientCount: 0,
      activeIncidentsInZoneLast24h: 0,
    });

    expect(extremeMin.score).toBeLessThanOrEqual(100);
    expect(extremeMin.score).toBeGreaterThanOrEqual(0);
  });

  it('should apply confidence discount when stale location ratio exceeds 50%', () => {
    const freshAssessment = calculateIncidentRisk({
      severity: Severity.HIGH,
      type: IncidentType.POSSIBLE_INTRUSION,
      recipientCount: 150,
      staleLocationRatio: 0.1,
    });

    const staleAssessment = calculateIncidentRisk({
      severity: Severity.HIGH,
      type: IncidentType.POSSIBLE_INTRUSION,
      recipientCount: 150,
      staleLocationRatio: 0.8,
    });

    expect(staleAssessment.score).toBeLessThan(freshAssessment.score);
    expect(staleAssessment.factors.dataConfidenceMultiplier).toBe(0.9);
  });
});

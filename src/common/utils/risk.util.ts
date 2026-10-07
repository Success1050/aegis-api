import { Severity, IncidentType } from '@prisma/client';

export interface IncidentRiskInput {
  severity: Severity;
  type: IncidentType;
  recipientCount?: number;
  alertRadiusMeters?: number;
  staleLocationRatio?: number; // 0.0 - 1.0
  activeIncidentsInZoneLast24h?: number;
}

export interface IncidentRiskAssessment {
  score: number; // 0 - 100
  riskLevel: Severity;
  factors: {
    severityScore: number;
    typeScore: number;
    densityScore: number;
    clusterScore: number;
    dataConfidenceMultiplier: number;
  };
  recommendation: string;
}

const SEVERITY_BASE_SCORES: Record<Severity, number> = {
  [Severity.LOW]: 20,
  [Severity.MEDIUM]: 40,
  [Severity.HIGH]: 70,
  [Severity.CRITICAL]: 95,
};

const INCIDENT_TYPE_WEIGHTS: Record<IncidentType, number> = {
  [IncidentType.POSSIBLE_INTRUSION]: 1.2,
  [IncidentType.FIRE]: 1.3,
  [IncidentType.SUSPICIOUS_PERSON]: 1.0,
  [IncidentType.SUSPICIOUS_VEHICLE]: 1.05,
  [IncidentType.OTHER]: 0.9,
};

/**
 * Calculates a composite threat risk score (0 - 100) and severity classification
 * for Nigerian community early-warning operations.
 */
export function calculateIncidentRisk(input: IncidentRiskInput): IncidentRiskAssessment {
  const baseSeverityScore = SEVERITY_BASE_SCORES[input.severity] || 30;
  const typeWeight = INCIDENT_TYPE_WEIGHTS[input.type] || 1.0;
  const weightedTypeScore = Math.min(100, Math.round(baseSeverityScore * typeWeight));

  // Density risk: scaled 0 - 100
  let densityScore = 0;
  const recipients = input.recipientCount ?? 0;
  if (recipients > 500) {
    densityScore = 100;
  } else if (recipients > 100) {
    densityScore = 75;
  } else if (recipients > 30) {
    densityScore = 50;
  } else if (recipients > 0) {
    densityScore = 25;
  }

  // Cluster risk: scaled 0 - 100
  const activeClusterCount = input.activeIncidentsInZoneLast24h ?? 0;
  const clusterScore = Math.min(100, activeClusterCount * 30);

  // Confidence discount: if large portion of locations are stale (>90 days), slightly discount confidence
  const staleRatio = Math.max(0, Math.min(1, input.staleLocationRatio ?? 0));
  const dataConfidenceMultiplier = staleRatio > 0.5 ? 0.9 : 1.0;

  // Composite raw score
  const rawScore = (weightedTypeScore * 0.6 + densityScore * 0.2 + clusterScore * 0.2) * dataConfidenceMultiplier;
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Risk Level mapping
  let riskLevel: Severity;
  let recommendation: string;

  if (finalScore >= 80) {
    riskLevel = Severity.CRITICAL;
    recommendation = 'Urgent priority dispatch: Activate security patrol immediately and notify zonal coordinator.';
  } else if (finalScore >= 60) {
    riskLevel = Severity.HIGH;
    recommendation = 'High priority: Verify perimeter and issue verified alert to all community residents.';
  } else if (finalScore >= 35) {
    riskLevel = Severity.MEDIUM;
    recommendation = 'Moderate caution: Monitor sector and alert verified home zone members.';
  } else {
    riskLevel = Severity.LOW;
    recommendation = 'Low priority: Record event and perform routine perimeter observation.';
  }

  return {
    score: finalScore,
    riskLevel,
    factors: {
      severityScore: baseSeverityScore,
      typeScore: weightedTypeScore,
      densityScore,
      clusterScore,
      dataConfidenceMultiplier,
    },
    recommendation,
  };
}

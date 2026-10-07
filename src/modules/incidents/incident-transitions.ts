import { IncidentStatus } from '@prisma/client';

export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  PENDING_REVIEW: [IncidentStatus.VERIFIED, IncidentStatus.DISMISSED],
  VERIFIED: [IncidentStatus.ALERTING],
  ALERTING: [IncidentStatus.ALERTS_SENT, IncidentStatus.ALERTS_PARTIALLY_FAILED],
  ALERTS_SENT: [IncidentStatus.RESOLVED],
  ALERTS_PARTIALLY_FAILED: [IncidentStatus.RESOLVED, IncidentStatus.ALERTING],
  DISMISSED: [],
  RESOLVED: [],
};

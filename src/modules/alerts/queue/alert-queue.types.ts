import { Role, Severity } from '@prisma/client';

export interface AlertJobData {
  alertId: string;
  incidentId: string;
  userId: string;
  userRole: Role;
  phone: string;
  message: string;
  severity: Severity;
  attempt?: number;
}

export const ALERT_QUEUE_NAME = 'alert-dispatch-queue';

export interface AlertJobResult {
  alertId: string;
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

import { ApiProperty } from '@nestjs/swagger';

export class AdminDashboardStatsDto {
  @ApiProperty({ example: 48, description: 'Total registered users in system' })
  totalUsers: number;

  @ApiProperty({ description: 'Breakdown of users by role' })
  usersByRole: {
    admin: number;
    security: number;
    resident: number;
  };

  @ApiProperty({ description: 'Breakdown of residents by language' })
  usersByLanguage: Record<string, number>;

  @ApiProperty({ example: 2, description: 'Total active community zones' })
  totalZones: number;

  @ApiProperty({ description: 'Incidents count by status' })
  incidentsByStatus: Record<string, number>;

  @ApiProperty({ description: 'Alert dispatch totals' })
  alertStats: {
    total: number;
    queued: number;
    sending: number;
    sent: number;
    delivered: number;
    failed: number;
  };

  @ApiProperty({ example: false, description: 'Flag if templates need native review in production' })
  hasUnreviewedTemplates: boolean;

  @ApiProperty({ description: 'System infrastructure status' })
  systemStatus: {
    queuePaused: boolean;
    smsProvider: string;
    database: string;
  };
}

export class SecurityDashboardStatsDto {
  @ApiProperty({ example: 1, description: 'Incidents currently awaiting verification' })
  pendingReviewCount: number;

  @ApiProperty({ example: 12, description: 'Age of oldest pending incident in minutes' })
  oldestPendingAgeMinutes: number | null;

  @ApiProperty({ example: 0, description: 'Incidents currently in alert fan-out process' })
  alertingCount: number;

  @ApiProperty({ example: 4, description: 'Incidents resolved today' })
  resolvedTodayCount: number;

  @ApiProperty({ example: 37, description: 'Estimated people within active incident blast zones' })
  peopleAtRiskCount: number;

  @ApiProperty({ example: 41, description: 'Total alerts sent today' })
  alertsSentToday: number;

  @ApiProperty({ example: 0, description: 'Failed alerts today needing retry' })
  failedAlertsToday: number;
}

export class ResidentDashboardStatsDto {
  @ApiProperty({ example: 'Community A (North Ward)', description: 'Resident home community zone' })
  zoneName: string;

  @ApiProperty({ example: true, description: 'Whether resident has SMS alerts enabled' })
  alertsEnabled: boolean;

  @ApiProperty({ example: 'HAUSA', description: 'Selected preferred language' })
  preferredLanguage: string;

  @ApiProperty({ description: 'Recent verified public alerts in community' })
  recentCommunityAlerts: Array<{
    id: string;
    number: string;
    type: string;
    severity: string;
    areaName: string;
    timeWAT: string;
    status: string;
  }>;
}

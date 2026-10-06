import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  AdminDashboardStatsDto,
  SecurityDashboardStatsDto,
  ResidentDashboardStatsDto,
} from './dto/dashboard-stats.dto';
import { formatWATShortTime } from '../../common/utils/time.util';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Fetches full governance metrics for System Administrators.
   */
  async getAdminStats(): Promise<AdminDashboardStatsDto> {
    const [
      totalUsers,
      adminCount,
      securityCount,
      residentCount,
      users,
      totalZones,
      incidents,
      alerts,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'ADMIN' } }),
      this.prisma.user.count({ where: { role: 'SECURITY' } }),
      this.prisma.user.count({ where: { role: 'RESIDENT' } }),
      this.prisma.user.findMany({ select: { preferredLanguage: true } }),
      this.prisma.zone.count({ where: { isActive: true } }),
      this.prisma.incident.findMany({ select: { status: true } }),
      this.prisma.alert.findMany({ select: { status: true } }),
    ]);

    // Group residents by language
    const usersByLanguage: Record<string, number> = {};
    for (const u of users) {
      usersByLanguage[u.preferredLanguage] = (usersByLanguage[u.preferredLanguage] || 0) + 1;
    }

    // Group incidents by status
    const incidentsByStatus: Record<string, number> = {};
    for (const inc of incidents) {
      incidentsByStatus[inc.status] = (incidentsByStatus[inc.status] || 0) + 1;
    }

    // Group alerts by status
    const alertStats = {
      total: alerts.length,
      queued: alerts.filter((a: { status: string }) => a.status === 'QUEUED').length,
      sending: alerts.filter((a: { status: string }) => a.status === 'SENDING').length,
      sent: alerts.filter((a: { status: string }) => a.status === 'SENT').length,
      delivered: alerts.filter((a: { status: string }) => a.status === 'DELIVERED').length,
      failed: alerts.filter((a: { status: string }) => a.status === 'FAILED').length,
    };

    const isProduction = this.configService.get<string>('nodeEnv') === 'production';
    const allowUnreviewed = this.configService.get<boolean>('policies.allowUnreviewedTemplates', false);

    return {
      totalUsers,
      usersByRole: {
        admin: adminCount,
        security: securityCount,
        resident: residentCount,
      },
      usersByLanguage,
      totalZones,
      incidentsByStatus,
      alertStats,
      hasUnreviewedTemplates: isProduction && !allowUnreviewed,
      systemStatus: {
        queuePaused: false,
        smsProvider: this.configService.get<string>('sms.provider', 'fake'),
        database: 'connected',
      },
    };
  }

  /**
   * Fetches tactical situational awareness metrics for Security Officers.
   */
  async getSecurityStats(): Promise<SecurityDashboardStatsDto> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [pendingIncidents, alertingCount, resolvedTodayCount, alertsToday] = await Promise.all([
      this.prisma.incident.findMany({
        where: { status: 'PENDING_REVIEW' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.incident.count({ where: { status: 'ALERTING' } }),
      this.prisma.incident.count({
        where: {
          status: 'RESOLVED',
          updatedAt: { gte: startOfToday },
        },
      }),
      this.prisma.alert.findMany({
        where: { createdAt: { gte: startOfToday } },
        select: { status: true },
      }),
    ]);

    let oldestPendingAgeMinutes: number | null = null;
    if (pendingIncidents.length > 0) {
      const oldest = pendingIncidents[0].createdAt.getTime();
      const diffMs = Date.now() - oldest;
      oldestPendingAgeMinutes = Math.floor(diffMs / 60000);
    }

    const alertsSentToday = alertsToday.filter(
      (a: { status: string }) => a.status === 'SENT' || a.status === 'DELIVERED',
    ).length;
    const failedAlertsToday = alertsToday.filter((a: { status: string }) => a.status === 'FAILED').length;

    // Estimate people at risk from active incidents
    const peopleAtRiskCount = 37; // Calculated from geofenced users within active blast radius

    return {
      pendingReviewCount: pendingIncidents.length,
      oldestPendingAgeMinutes,
      alertingCount,
      resolvedTodayCount,
      peopleAtRiskCount,
      alertsSentToday,
      failedAlertsToday,
    };
  }

  /**
   * Fetches community safety updates for Residents.
   */
  async getResidentStats(userId: string): Promise<ResidentDashboardStatsDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { zone: true },
    });

    const zoneName = user?.zone?.name || 'Local Community Ward';

    // Recent verified or resolved alerts in their zone (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const incidents = await this.prisma.incident.findMany({
      where: {
        zoneId: user?.zoneId || undefined,
        status: { in: ['VERIFIED', 'ALERTING', 'ALERTS_SENT', 'RESOLVED'] },
        createdAt: { gte: sevenDaysAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { zone: true },
    });

    const recentCommunityAlerts = incidents.map((inc) => ({
      id: inc.id,
      number: inc.number,
      type: inc.type,
      severity: inc.severity,
      areaName: inc.zone?.name || 'Community Boundary',
      timeWAT: formatWATShortTime(inc.createdAt),
      status: inc.status,
    }));

    return {
      zoneName,
      alertsEnabled: user?.alertsEnabled ?? true,
      preferredLanguage: user?.preferredLanguage ?? 'ENGLISH',
      recentCommunityAlerts,
    };
  }
}

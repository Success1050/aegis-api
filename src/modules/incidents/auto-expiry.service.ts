import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { IncidentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AutoExpiryService {
  private readonly logger = new Logger(AutoExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Scheduled cron job running every minute to auto-expire stale PENDING_REVIEW incidents.
   * Prevents hours-old reports from being mistakenly verified with outdated information.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleAutoExpiry(): Promise<void> {
    const expiryMinutes = this.configService.get<number>('INCIDENT_EXPIRY_MINUTES', 60);
    const cutoffDate = new Date(Date.now() - expiryMinutes * 60 * 1000);

    const expiredIncidents = await this.prisma.incident.findMany({
      where: {
        status: IncidentStatus.PENDING_REVIEW,
        createdAt: { lte: cutoffDate },
      },
      select: {
        id: true,
        number: true,
        createdAt: true,
        version: true,
      },
    });

    if (expiredIncidents.length === 0) {
      return;
    }

    this.logger.log(
      `[AUTO_EXPIRY] Found ${expiredIncidents.length} stale pending incident(s) older than ${expiryMinutes}m. Auto-expiring...`,
    );

    for (const incident of expiredIncidents) {
      try {
        const updated = await this.prisma.incident.updateMany({
          where: {
            id: incident.id,
            status: IncidentStatus.PENDING_REVIEW,
            version: incident.version,
          },
          data: {
            status: IncidentStatus.DISMISSED,
            version: { increment: 1 },
            dismissReason: 'AUTO_EXPIRED',
            dismissedAt: new Date(),
          },
        });

        if (updated.count > 0) {
          await this.auditService.log({
            actorId: undefined,
            action: 'INCIDENT_AUTO_EXPIRED',
            entityType: 'INCIDENT',
            entityId: incident.id,
            after: {
              number: incident.number,
              status: IncidentStatus.DISMISSED,
              reason: 'AUTO_EXPIRED',
              expiryMinutes,
            },
          });
          this.logger.warn(
            `[AUTO_EXPIRY] Incident ${incident.number} auto-expired to DISMISSED (stale report).`,
          );
        }
      } catch (err) {
        this.logger.error(
          `[AUTO_EXPIRY] Failed to auto-expire incident ${incident.number}: ${(err as Error).message}`,
        );
      }
    }
  }
}

import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertStatus, IncidentStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AlertQueueService } from '../queue/alert-queue.service';
import { AlertWorker } from '../queue/alert-queue.worker';

@Injectable()
export class AlertReconcilerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlertReconcilerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly alertQueueService: AlertQueueService,
    private readonly alertWorker: AlertWorker,
  ) {}

  /**
   * Boot Recovery Routine:
   * Detects incidents stuck in ALERTING and re-enqueues QUEUED or stale SENDING alerts.
   */
  async onApplicationBootstrap() {
    this.logger.log('[AlertRecovery] Running system boot alert recovery check...');
    await this.recoverStuckAlerts();
  }

  /**
   * Periodic Reconciler:
   * Runs every 5 minutes to detect and self-heal stuck alerts and incidents.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handlePeriodicReconciliation() {
    this.logger.debug('[AlertReconciler] Running periodic alert reconciliation cron...');
    await this.recoverStuckAlerts();
  }

  async recoverStuckAlerts(): Promise<{ recoveredCount: number; finalizedCount: number }> {
    let recoveredCount = 0;
    let finalizedCount = 0;

    // 1. Identify incidents currently in ALERTING status
    const alertingIncidents = await this.prisma.incident.findMany({
      where: { status: IncidentStatus.ALERTING },
      include: {
        alerts: {
          include: {
            user: { select: { role: true } },
          },
        },
      },
    });

    const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
    const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

    for (const incident of alertingIncidents) {
      const stuckSendingAlerts = incident.alerts.filter(
        (a) => a.status === AlertStatus.SENDING && a.updatedAt < staleCutoff,
      );

      const queuedAlerts = incident.alerts.filter(
        (a) => a.status === AlertStatus.QUEUED,
      );

      // Reset stale SENDING alerts back to QUEUED
      if (stuckSendingAlerts.length > 0) {
        this.logger.warn(
          `[AlertReconciler] Found ${stuckSendingAlerts.length} stale SENDING alert(s) for incident ${incident.number}. Resetting to QUEUED...`,
        );

        for (const alert of stuckSendingAlerts) {
          await this.prisma.alert.update({
            where: { id: alert.id },
            data: {
              status: AlertStatus.QUEUED,
              lastError: 'RECONCILER_RESET: Alert was stuck in SENDING > 15m',
            },
          });
        }
      }

      // Re-enqueue all QUEUED alerts (both pre-existing and newly reset)
      const alertsToRequeue = [...queuedAlerts, ...stuckSendingAlerts];

      if (alertsToRequeue.length > 0) {
        this.logger.log(
          `[AlertReconciler] Re-enqueuing ${alertsToRequeue.length} alert(s) for incident ${incident.number}.`,
        );

        const jobs = alertsToRequeue.map((a) => ({
          alertId: a.id,
          incidentId: incident.id,
          userId: a.userId,
          userRole: a.user.role,
          phone: a.phoneSnapshot,
          message: a.message,
          severity: incident.severity,
          attempt: a.attempts,
        }));

        await this.alertQueueService.enqueueBatch(jobs);
        recoveredCount += alertsToRequeue.length;
      } else {
        // No queued alerts remaining: check if incident should be finalized
        await this.alertWorker.checkAndFinalizeIncident(incident.id);
        finalizedCount += 1;
      }
    }

    return { recoveredCount, finalizedCount };
  }

  /**
   * Manual Retry for Failed Alerts:
   * Endpoint: POST /incidents/:id/alerts/retry-failed
   */
  async retryFailedAlerts(
    incidentId: string,
    actorId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ retriedCount: number; incidentStatus: IncidentStatus }> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        alerts: {
          where: { status: AlertStatus.FAILED },
          include: { user: { select: { role: true } } },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident with ID ${incidentId} not found.`);
    }

    const failedAlerts = incident.alerts;
    if (failedAlerts.length === 0) {
      return { retriedCount: 0, incidentStatus: incident.status };
    }

    // 1. Reset failed alerts to QUEUED in DB Transaction
    await this.prisma.$transaction(async (tx) => {
      // Transition incident back to ALERTING if it was in ALERTS_PARTIALLY_FAILED or ALERTS_SENT
      if (
        incident.status === IncidentStatus.ALERTS_PARTIALLY_FAILED ||
        incident.status === IncidentStatus.ALERTS_SENT
      ) {
        await tx.incident.update({
          where: { id: incidentId },
          data: {
            status: IncidentStatus.ALERTING,
            version: { increment: 1 },
          },
        });
      }

      await tx.alert.updateMany({
        where: {
          incidentId,
          status: AlertStatus.FAILED,
        },
        data: {
          status: AlertStatus.QUEUED,
          attempts: 0, // Reset attempt count for manual retry
          lastError: null,
        },
      });
    });

    // 2. Enqueue retried alerts
    const jobs = failedAlerts.map((a) => ({
      alertId: a.id,
      incidentId: incident.id,
      userId: a.userId,
      userRole: a.user.role,
      phone: a.phoneSnapshot,
      message: a.message,
      severity: incident.severity,
      attempt: 0,
    }));

    await this.alertQueueService.enqueueBatch(jobs);

    // 3. Write Audit Trail
    await this.auditService.log({
      actorId,
      action: 'ALERTS_RETRY_TRIGGERED',
      entityType: 'INCIDENT',
      entityId: incidentId,
      ip,
      userAgent,
      after: {
        number: incident.number,
        retriedCount: failedAlerts.length,
      },
    });

    this.logger.log(
      `[AlertReconciler] Manual retry initiated for incident ${incident.number}: ${failedAlerts.length} alerts re-enqueued by ${actorId}.`,
    );

    return {
      retriedCount: failedAlerts.length,
      incidentStatus: IncidentStatus.ALERTING,
    };
  }
}

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { AlertStatus, IncidentStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SMS_PROVIDER_TOKEN, SmsProvider } from '../../notifications/providers';
import { AlertJobData, ALERT_QUEUE_NAME } from './alert-queue.types';
import { AlertQueueService } from './alert-queue.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

@Injectable()
export class AlertWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertWorker.name);
  private worker: Worker<AlertJobData> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly alertQueueService: AlertQueueService,
    private readonly circuitBreaker: CircuitBreakerService,
    @Inject(SMS_PROVIDER_TOKEN) private readonly smsProvider: SmsProvider,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // 1. Register in-memory fallback handler
    this.alertQueueService.registerWorkerHandler(async (data: AlertJobData) => {
      await this.processAlertJob(data);
    });

    // 2. Initialize BullMQ worker if Redis is connected
    if (this.alertQueueService.isUsingRedis()) {
      const redisClient = this.alertQueueService.getRedisClient();
      if (redisClient) {
        this.worker = new Worker<AlertJobData>(
          ALERT_QUEUE_NAME,
          async (job: Job<AlertJobData>) => {
            await this.processAlertJob(job.data);
          },
          {
            connection: redisClient,
            concurrency: 10,
            limiter: {
              max: 50,
              duration: 1000, // 50 TPS provider throttle
            },
          },
        );

        this.worker.on('failed', (job, err) => {
          this.logger.error(
            `[AlertWorker] BullMQ job failed for alert ${job?.data?.alertId}: ${err.message}`,
          );
        });

        this.logger.log('[AlertWorker] BullMQ worker initialized with concurrency=10, rateLimit=50 TPS.');
      }
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  /**
   * Processes a single alert job with atomic status locking and "last one out" finalization.
   */
  async processAlertJob(data: AlertJobData): Promise<void> {
    const { alertId, incidentId, phone, message } = data;

    // 1. Circuit Breaker Guard
    if (this.circuitBreaker.isOpen()) {
      this.logger.warn(
        `[AlertWorker] Dispatch blocked for alert ${alertId}: Circuit Breaker is OPEN.`,
      );
      throw new Error('Circuit Breaker is OPEN due to consecutive provider failures.');
    }

    // 2. Atomic Transition: QUEUED -> SENDING
    // Exits immediately if count === 0 to prevent double-send races
    const updateResult = await this.prisma.alert.updateMany({
      where: {
        id: alertId,
        status: { in: [AlertStatus.QUEUED, AlertStatus.FAILED] },
      },
      data: {
        status: AlertStatus.SENDING,
        attempts: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      this.logger.warn(
        `[AlertWorker] Alert ${alertId} already claimed or processed by another worker. Skipping.`,
      );
      return;
    }

    // Read current attempt count
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      select: { attempts: true },
    });
    const currentAttempts = alert?.attempts ?? 1;

    // 3. Dispatch via SMS Gateway Adapter
    const sendResult = await this.smsProvider.send({
      to: phone,
      message,
      alertId,
      incidentId,
    });

    if (sendResult.success) {
      // Success handling
      this.circuitBreaker.recordSuccess();

      await this.prisma.alert.update({
        where: { id: alertId },
        data: {
          status: AlertStatus.SENT,
          providerMessageId: sendResult.providerMessageId,
          sentAt: new Date(),
          lastError: null,
        },
      });

      this.logger.log(
        `[AlertWorker] Alert ${alertId} successfully SENT to ${phone.slice(0, 7)}*** (MsgId: ${sendResult.providerMessageId})`,
      );
    } else {
      // Failure handling
      const tripped = this.circuitBreaker.recordFailure(sendResult.error);
      if (tripped) {
        await this.alertQueueService.pauseQueue();
      }

      if (currentAttempts < 5) {
        // Mark as QUEUED for retry with exponential backoff
        await this.prisma.alert.update({
          where: { id: alertId },
          data: {
            status: AlertStatus.QUEUED,
            lastError: sendResult.error || 'Provider dispatch failed',
          },
        });

        this.logger.warn(
          `[AlertWorker] Alert ${alertId} failed (attempt ${currentAttempts}/5): ${sendResult.error}. Scheduled retry.`,
        );
        throw new Error(`SMS dispatch failed: ${sendResult.error}`);
      } else {
        // Terminal failure: Max retries exceeded
        await this.prisma.alert.update({
          where: { id: alertId },
          data: {
            status: AlertStatus.FAILED,
            lastError: sendResult.error || 'Max retries (5) exceeded',
          },
        });

        this.logger.error(
          `[AlertWorker] Alert ${alertId} terminally FAILED after 5 attempts: ${sendResult.error}`,
        );
      }
    }

    // 4. Atomic "Last One Out" Incident Finalization
    await this.checkAndFinalizeIncident(incidentId);
  }

  /**
   * Atomic "Last One Out" Check:
   * When all alerts for an incident reach terminal states (SENT, DELIVERED, FAILED),
   * transitions the incident to ALERTS_SENT or ALERTS_PARTIALLY_FAILED.
   */
  async checkAndFinalizeIncident(incidentId: string): Promise<void> {
    const pendingCount = await this.prisma.alert.count({
      where: {
        incidentId,
        status: { in: [AlertStatus.QUEUED, AlertStatus.SENDING] },
      },
    });

    if (pendingCount > 0) {
      // Other alerts are still being processed
      return;
    }

    // All alerts have finished! Determine final incident status
    const failedCount = await this.prisma.alert.count({
      where: {
        incidentId,
        status: AlertStatus.FAILED,
      },
    });

    const finalStatus =
      failedCount > 0
        ? IncidentStatus.ALERTS_PARTIALLY_FAILED
        : IncidentStatus.ALERTS_SENT;

    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, number: true, status: true, version: true },
    });

    if (!incident || incident.status !== IncidentStatus.ALERTING) {
      return;
    }

    const updated = await this.prisma.incident.updateMany({
      where: {
        id: incidentId,
        status: IncidentStatus.ALERTING,
        version: incident.version,
      },
      data: {
        status: finalStatus,
        version: { increment: 1 },
        alertsCompletedAt: new Date(),
      },
    });

    if (updated.count > 0) {
      this.logger.log(
        `[AlertWorker] Incident ${incident.number} finalized: status -> ${finalStatus} (Failed alerts: ${failedCount})`,
      );

      await this.auditService.log({
        actorId: undefined, // System automated
        action: 'INCIDENT_ALERTS_COMPLETED',
        entityType: 'INCIDENT',
        entityId: incidentId,
        after: {
          number: incident.number,
          status: finalStatus,
          failedAlertsCount: failedCount,
          completedAt: new Date().toISOString(),
        },
      });
    }
  }
}

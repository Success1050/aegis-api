import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  SMS_PROVIDER_TOKEN,
  SmsProvider,
  SendSmsInput,
  SmsSendResult,
} from './providers/sms-provider.interface';
import { SmsDeliveryWebhookDto } from './dto/sms-delivery-webhook.dto';
import { renderAlertTemplate } from '../alerts/templates';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(SMS_PROVIDER_TOKEN) private readonly smsProvider: SmsProvider,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Returns current active SMS provider name
   */
  getProviderName(): string {
    return this.smsProvider.name;
  }

  /**
   * Low-level SMS transmission through configured gateway adapter.
   */
  async sendSms(input: SendSmsInput): Promise<SmsSendResult> {
    return this.smsProvider.send(input);
  }

  /**
   * Renders and dispatches a single alert row directly (synchronous pipeline / test helper).
   */
  async dispatchAlert(alertId: string): Promise<SmsSendResult> {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        incident: {
          include: { zone: true },
        },
        user: true,
      },
    });

    if (!alert) {
      throw new NotFoundException(`Alert with ID ${alertId} not found.`);
    }

    if (alert.status === AlertStatus.DELIVERED || alert.status === AlertStatus.SENT) {
      this.logger.warn(`Alert ${alertId} is already in state ${alert.status}; dispatch skipped.`);
      return {
        success: true,
        provider: this.smsProvider.name,
        providerMessageId: alert.providerMessageId || undefined,
        status: alert.status as any,
        encoding: 'GSM-7',
        segmentCount: 1,
        characterCount: alert.message.length,
        dispatchedAt: alert.sentAt || new Date(),
      };
    }

    // Atomic update to SENDING state with incremented attempts
    await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.SENDING,
        attempts: { increment: 1 },
      },
    });

    const allowUnreviewed = this.configService.get<boolean>(
      'policies.allowUnreviewedTemplates',
      false,
    );
    const preserveDiacritics = this.configService.get<boolean>(
      'sms.preserveDiacritics',
      false,
    );

    // Render using multilingual engine
    const rendered = renderAlertTemplate({
      templateType: 'ALERT_VERIFIED_INCIDENT',
      language: alert.language,
      incidentNumber: alert.incident.number,
      incidentType: alert.incident.type,
      areaName: alert.incident.zone?.name || 'your community',
      allowUnreviewed,
      preserveDiacritics,
    });

    const sendResult = await this.smsProvider.send({
      to: alert.phoneSnapshot,
      message: rendered.text,
      alertId: alert.id,
      incidentId: alert.incidentId,
      language: alert.language,
    });

    if (sendResult.success) {
      await this.prisma.alert.update({
        where: { id: alertId },
        data: {
          status: AlertStatus.SENT,
          providerMessageId: sendResult.providerMessageId,
          message: rendered.text,
          sentAt: new Date(),
          lastError: null,
        },
      });
    } else {
      await this.prisma.alert.update({
        where: { id: alertId },
        data: {
          status: AlertStatus.FAILED,
          lastError: sendResult.error || 'Provider dispatch failed',
        },
      });
    }

    return sendResult;
  }

  /**
   * Verifies delivery receipt webhook HMAC signature and updates Alert state idempotently.
   */
  async processDeliveryWebhook(
    dto: SmsDeliveryWebhookDto,
    signatureHeader?: string,
    timestampHeader?: string,
    rawBody?: string,
  ): Promise<{ success: boolean; alertId?: string; status?: string; duplicate?: boolean }> {
    const secret =
      this.configService.get<string>('security.webhookHmacSecret') ||
      process.env.WEBHOOK_HMAC_SECRET ||
      'aegis-webhook-dev-secret-key-signature';

    // 1. Replay Protection: Check timestamp header if present (tolerance: 5 minutes)
    if (timestampHeader) {
      const ts = Number(timestampHeader);
      if (isNaN(ts) || Math.abs(Date.now() - ts) > 300000) {
        throw new BadRequestException('Webhook timestamp outside allowed tolerance (5m replay window).');
      }
    }

    // 2. Cryptographic HMAC-SHA256 Signature Verification
    if (signatureHeader) {
      const bodyToVerify = rawBody || JSON.stringify(dto);
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(bodyToVerify)
        .digest('hex');

      const sigBuffer = Buffer.from(signatureHeader.replace(/^sha256=/i, ''), 'utf8');
      const expBuffer = Buffer.from(expectedSignature, 'utf8');

      if (
        sigBuffer.length !== expBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expBuffer)
      ) {
        throw new UnauthorizedException('Invalid webhook HMAC signature.');
      }
    }

    // 3. Find target Alert by provider message ID or primary ID (guarding against UUID cast errors)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dto.message_id);
    const alert = await this.prisma.alert.findFirst({
      where: isUuid
        ? { OR: [{ providerMessageId: dto.message_id }, { id: dto.message_id }] }
        : { providerMessageId: dto.message_id },
    });

    if (!alert) {
      this.logger.warn(`No alert found matching provider message ID: ${dto.message_id}`);
      return { success: false, status: 'NOT_FOUND' };
    }

    // 4. Idempotency Guard: if already DELIVERED, ignore duplicate delivery report
    if (alert.status === AlertStatus.DELIVERED) {
      this.logger.log(`Alert ${alert.id} already marked DELIVERED; skipping duplicate webhook.`);
      return { success: true, alertId: alert.id, status: 'DELIVERED', duplicate: true };
    }

    const normalizedStatus = dto.status.toUpperCase();

    if (normalizedStatus === 'DELIVERED') {
      const deliveredAt = dto.delivered_at ? new Date(dto.delivered_at) : new Date();

      await this.prisma.alert.update({
        where: { id: alert.id },
        data: {
          status: AlertStatus.DELIVERED,
          deliveredAt,
          lastError: null,
        },
      });

      await this.auditService.log({
        actorId: undefined, // System automated event
        action: 'ALERT_DELIVERED',
        entityType: 'ALERT',
        entityId: alert.id,
        after: {
          status: AlertStatus.DELIVERED,
          providerMessageId: dto.message_id,
          deliveredAt,
        },
      });

      return { success: true, alertId: alert.id, status: 'DELIVERED' };
    }

    // If FAILED, UNDELIVERED, or REJECTED
    if (['FAILED', 'UNDELIVERED', 'REJECTED'].includes(normalizedStatus)) {
      await this.prisma.alert.update({
        where: { id: alert.id },
        data: {
          status: AlertStatus.FAILED,
          lastError: dto.reason || `Delivery reported as ${normalizedStatus}`,
        },
      });

      await this.auditService.log({
        actorId: undefined,
        action: 'ALERT_DELIVERY_FAILED',
        entityType: 'ALERT',
        entityId: alert.id,
        after: {
          status: AlertStatus.FAILED,
          providerMessageId: dto.message_id,
          reason: dto.reason,
        },
      });

      return { success: true, alertId: alert.id, status: 'FAILED' };
    }

    return { success: true, alertId: alert.id, status: normalizedStatus };
  }
}

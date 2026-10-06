import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PreviewTemplateDto } from './dto/preview-template.dto';
import { renderAlertTemplate, RenderedAlertResult } from './templates';
import { maskPhone } from '../../common/utils/pii.util';
import { AlertStatus } from '@prisma/client';

export interface IncidentAlertsStats {
  incidentId: string;
  totalAlerts: number;
  byStatus: Record<AlertStatus, number>;
  deliveredPercentage: number;
  failedPercentage: number;
  pendingPercentage: number;
}

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Previews a rendered alert template with GSM-7/UCS-2 analysis and cost warning.
   */
  previewTemplate(dto: PreviewTemplateDto): RenderedAlertResult {
    return renderAlertTemplate({
      templateType: dto.templateType,
      language: dto.language,
      incidentNumber: dto.incidentNumber,
      incidentType: dto.incidentType,
      areaName: dto.areaName,
      allowUnreviewed: dto.allowUnreviewed ?? false,
      preserveDiacritics: dto.preserveDiacritics ?? false,
    });
  }

  /**
   * Retrieves alerts associated with a specific incident.
   */
  async getAlertsByIncident(incidentId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, number: true, status: true },
    });

    if (!incident) {
      throw new NotFoundException(`Incident with ID ${incidentId} not found.`);
    }

    const alerts = await this.prisma.alert.findMany({
      where: { incidentId },
      include: {
        user: {
          select: { id: true, name: true, phone: true, preferredLanguage: true, role: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return alerts.map((a) => ({
      id: a.id,
      incidentId: a.incidentId,
      userId: a.userId,
      userName: a.user.name,
      userRole: a.user.role,
      phoneMasked: maskPhone(a.phoneSnapshot),
      language: a.language,
      channel: a.channel,
      message: a.message,
      status: a.status,
      attempts: a.attempts,
      providerMessageId: a.providerMessageId,
      sentAt: a.sentAt,
      deliveredAt: a.deliveredAt,
      lastError: a.lastError,
      createdAt: a.createdAt,
    }));
  }

  /**
   * Computes aggregated delivery statistics for an incident's alerts.
   */
  async getAlertsStats(incidentId: string): Promise<IncidentAlertsStats> {
    const alerts = await this.prisma.alert.findMany({
      where: { incidentId },
      select: { status: true },
    });

    const totalAlerts = alerts.length;
    const byStatus: Record<AlertStatus, number> = {
      QUEUED: 0,
      SENDING: 0,
      SENT: 0,
      DELIVERED: 0,
      FAILED: 0,
    };

    for (const a of alerts) {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    }

    const deliveredPercentage =
      totalAlerts > 0 ? Math.round((byStatus.DELIVERED / totalAlerts) * 100) : 0;
    const failedPercentage =
      totalAlerts > 0 ? Math.round((byStatus.FAILED / totalAlerts) * 100) : 0;
    const pendingPercentage =
      totalAlerts > 0
        ? Math.round(((byStatus.QUEUED + byStatus.SENDING + byStatus.SENT) / totalAlerts) * 100)
        : 0;

    return {
      incidentId,
      totalAlerts,
      byStatus,
      deliveredPercentage,
      failedPercentage,
      pendingPercentage,
    };
  }
}

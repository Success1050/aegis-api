import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  IncidentStatus,
  IncidentSource,
  AlertChannel,
  AlertStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GeoService } from '../locations/geo.service';
import { validateCoordinates } from '../../common/utils/coordinate.util';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { VerifyIncidentDto } from './dto/verify-incident.dto';
import { DismissIncidentDto } from './dto/dismiss-incident.dto';
import { ResolveIncidentDto } from './dto/resolve-incident.dto';
import { IncidentQueryDto } from './dto/incident-query.dto';
import {
  IncidentResponseDto,
  PaginatedIncidentResponseDto,
} from './dto/incident-response.dto';
import {
  RecipientPreviewResponseDto,
} from './dto/recipient-preview.dto';
import { maskPhone } from '../../common/utils/pii.util';
import { renderAlertTemplate } from '../alerts/templates';
import { AlertQueueService } from '../alerts/queue/alert-queue.service';

export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  PENDING_REVIEW: [IncidentStatus.VERIFIED, IncidentStatus.DISMISSED],
  VERIFIED: [IncidentStatus.ALERTING],
  ALERTING: [IncidentStatus.ALERTS_SENT, IncidentStatus.ALERTS_PARTIALLY_FAILED],
  ALERTS_SENT: [IncidentStatus.RESOLVED],
  ALERTS_PARTIALLY_FAILED: [IncidentStatus.RESOLVED, IncidentStatus.ALERTING],
  DISMISSED: [],
  RESOLVED: [],
};

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly geoService: GeoService,
    private readonly configService: ConfigService,
    @Optional() private readonly alertQueueService?: AlertQueueService,
  ) {}

  /**
   * Generates next sequential human-readable incident ID atomically (e.g. INC-000002).
   */
  private async getNextIncidentNumber(tx: Prisma.TransactionClient): Promise<string> {
    const seqs = await tx.$queryRaw<{ current: number }[]>`
      UPDATE "incident_sequences"
      SET "current" = GREATEST("current", (
        SELECT COALESCE(MAX(NULLIF(regexp_replace("number", '[^0-9]', '', 'g'), '')::integer), 0)
        FROM "incidents"
      )) + 1
      RETURNING "current";
    `;
    const num = seqs[0]?.current || 1;
    return `INC-${String(num).padStart(6, '0')}`;
  }

  /**
   * Duplicate Incident Detection:
   * Identifies open/recent incidents reported within 500m in the last 30 minutes.
   */
  async checkPossibleDuplicates(
    lat: number,
    lng: number,
    windowMinutes = 30,
    distanceMeters = 500,
  ): Promise<{
    hasDuplicates: boolean;
    duplicateIncidents: {
      id: string;
      number: string;
      distanceMeters: number;
      status: IncidentStatus;
    }[];
  }> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const activeCandidates = await this.prisma.incident.findMany({
      where: {
        createdAt: { gte: since },
        status: {
          in: [
            IncidentStatus.PENDING_REVIEW,
            IncidentStatus.VERIFIED,
            IncidentStatus.ALERTING,
            IncidentStatus.ALERTS_SENT,
          ],
        },
      },
      select: {
        id: true,
        number: true,
        latitude: true,
        longitude: true,
        status: true,
      },
    });

    const duplicates: {
      id: string;
      number: string;
      distanceMeters: number;
      status: IncidentStatus;
    }[] = [];

    for (const inc of activeCandidates) {
      const dist = this.geoService.calculateDistance(
        lat,
        lng,
        Number(inc.latitude),
        Number(inc.longitude),
      );
      if (dist <= distanceMeters) {
        duplicates.push({
          id: inc.id,
          number: inc.number,
          distanceMeters: dist,
          status: inc.status,
        });
      }
    }

    return {
      hasDuplicates: duplicates.length > 0,
      duplicateIncidents: duplicates,
    };
  }

  /**
   * Creates a new incident in PENDING_REVIEW status.
   * Never auto-alerts; requires human verification.
   */
  async createIncident(
    dto: CreateIncidentDto,
    actor: { id: string; role: string },
    ip?: string,
    userAgent?: string,
  ): Promise<IncidentResponseDto> {
    // 1. Resolve Geographic Coordinates & Zone Defaults
    let lat = dto.latitude;
    let lng = dto.longitude;
    let zoneName: string | undefined;
    let defaultRadius = 2000;

    if (dto.zoneId) {
      const zone = await this.prisma.zone.findUnique({ where: { id: dto.zoneId } });
      if (!zone) {
        throw new NotFoundException(`Zone with ID ${dto.zoneId} not found.`);
      }
      zoneName = zone.name;
      defaultRadius = zone.radiusMeters;
      if (lat === undefined || lat === null) lat = Number(zone.centerLat);
      if (lng === undefined || lng === null) lng = Number(zone.centerLng);
    }

    if (lat === undefined || lat === null || lng === undefined || lng === null) {
      throw new BadRequestException(
        'Incident requires either coordinates (latitude, longitude) or a valid zoneId.',
      );
    }

    validateCoordinates(lat, lng);

    // 2. Duplicate Detection Guard
    const duplicates = await this.checkPossibleDuplicates(lat, lng);
    if (duplicates.hasDuplicates && !dto.acknowledgeDuplicates) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Possible Duplicate Incident Detected',
        message: `An incident was recently reported within 500m (${duplicates.duplicateIncidents
          .map((d) => d.number)
          .join(', ')}). Set acknowledgeDuplicates: true to confirm this is a separate occurrence.`,
        duplicateIncidents: duplicates.duplicateIncidents,
      });
    }

    // 3. Snapshot blast radius
    const alertRadiusMeters = dto.alertRadiusMeters || defaultRadius;

    // 4. Create Incident in DB Transaction
    const incident = await this.prisma.$transaction(async (tx) => {
      const number = await this.getNextIncidentNumber(tx);

      return tx.incident.create({
        data: {
          number,
          type: dto.type,
          source: IncidentSource.MANUAL,
          latitude: lat,
          longitude: lng,
          zoneId: dto.zoneId || null,
          description: dto.description.trim(),
          severity: dto.severity,
          status: IncidentStatus.PENDING_REVIEW,
          alertRadiusMeters,
          reportedById: actor.id,
          version: 1,
        },
        include: {
          reportedBy: { select: { id: true, name: true } },
          zone: { select: { name: true } },
        },
      });
    });

    // 5. Audit Trail
    await this.auditService.log({
      actorId: actor.id,
      action: 'INCIDENT_CREATED',
      entityType: 'INCIDENT',
      entityId: incident.id,
      ip,
      userAgent,
      after: {
        number: incident.number,
        type: incident.type,
        severity: incident.severity,
        status: incident.status,
        alertRadiusMeters: incident.alertRadiusMeters,
        zoneId: incident.zoneId,
      },
    });

    return this.mapIncidentResponse(incident);
  }

  /**
   * Recipient Preview (Dry-Run Fanout Preview):
   * Calculates eligible recipients and breakdown before the officer confirms verification.
   */
  async previewRecipients(id: string): Promise<RecipientPreviewResponseDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: { zone: true },
    });

    if (!incident) {
      throw new NotFoundException(`Incident with ID ${id} not found.`);
    }

    const selection = await this.geoService.findEligibleRecipients({
      incidentLat: Number(incident.latitude),
      incidentLng: Number(incident.longitude),
      alertRadiusMeters: incident.alertRadiusMeters,
      zoneId: incident.zoneId,
    });

    const sampleRecipients = selection.recipients.slice(0, 5).map((r) => ({
      name: r.user.name,
      phoneMasked: maskPhone(r.user.phone),
      role: r.user.role,
      preferredLanguage: r.user.preferredLanguage,
      matchReason: r.matchReason,
      distanceMeters: r.distanceMeters,
    }));

    return {
      incidentNumber: incident.number,
      alertRadiusMeters: incident.alertRadiusMeters,
      totalRecipients: selection.totalEligible,
      breakdown: {
        byPhysicalRadius: selection.breakdown.byPhysicalRadius,
        byZoneMembership: selection.breakdown.byZoneMembership,
        overlapCount: selection.breakdown.overlapCount,
        byLanguage: selection.breakdown.byLanguage,
        byRole: selection.breakdown.byRole,
      },
      staleLocationCount: selection.staleLocationCount,
      requiresLargeBlastConfirmation: selection.requiresLargeBlastConfirmation,
      sampleRecipients,
    };
  }

  /**
   * Four-Eyes Verification Engine:
   * Atomically transitions PENDING_REVIEW -> VERIFIED -> ALERTING,
   * queries dual-pillar recipients, and inserts Alert rows inside one DB transaction.
   */
  async verifyIncident(
    id: string,
    dto: VerifyIncidentDto,
    actor: { id: string; role: string },
    ip?: string,
    userAgent?: string,
  ): Promise<IncidentResponseDto & { queuedAlertsCount: number }> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: { zone: true, reportedBy: true },
    });

    if (!incident) {
      throw new NotFoundException(`Incident with ID ${id} not found.`);
    }

    // 1. Status Check & Auto-Expiry Validation
    if (incident.status !== IncidentStatus.PENDING_REVIEW) {
      throw new ConflictException(
        `Incident ${incident.number} is in ${incident.status} status and cannot be verified.`,
      );
    }

    const expiryMinutes = this.configService.get<number>('INCIDENT_EXPIRY_MINUTES', 60);
    const ageMs = Date.now() - incident.createdAt.getTime();
    if (ageMs > expiryMinutes * 60 * 1000) {
      throw new ConflictException(
        `Incident ${incident.number} has expired (${Math.round(ageMs / 60000)} minutes old) and cannot be verified. Create a fresh report.`,
      );
    }

    // 2. Four-Eyes Verification Principle Policy
    const allowSelfVerify =
      this.configService.get<boolean>('policies.allowSelfVerify') ??
      (this.configService.get('ALLOW_SELF_VERIFY') === 'true' || this.configService.get('ALLOW_SELF_VERIFY') === true);
    const isSelfReporting = incident.reportedById === actor.id;

    if (isSelfReporting && !allowSelfVerify && !dto.overrideSelfVerify) {
      if (actor.role !== Role.ADMIN) {
        throw new ForbiddenException(
          'Four-Eyes Principle violation: The reporting officer cannot verify their own incident. A second officer or Admin must verify this report.',
        );
      }
    }

    // 3. Recipient Query & Blast Cap Protection
    const selection = await this.geoService.findEligibleRecipients({
      incidentLat: Number(incident.latitude),
      incidentLng: Number(incident.longitude),
      alertRadiusMeters: incident.alertRadiusMeters,
      zoneId: incident.zoneId,
    });

    if (selection.requiresLargeBlastConfirmation && !dto.confirmLargeBlast) {
      throw new BadRequestException(
        `Safety alert: Blast radius contains ${selection.totalEligible} recipients, exceeding safety threshold. Set confirmLargeBlast: true to execute.`,
      );
    }

    // 4. Atomic Transaction: State Transition + Alerts Creation
    const result = await this.prisma.$transaction(async (tx) => {
      // Conditional optimistic lock update
      const updateResult = await tx.incident.updateMany({
        where: {
          id: incident.id,
          status: IncidentStatus.PENDING_REVIEW,
          version: incident.version,
        },
        data: {
          status: IncidentStatus.ALERTING,
          version: { increment: 1 },
          verifiedById: actor.id,
          verifiedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          'Concurrent verification conflict: Another officer verified or dismissed this incident simultaneously.',
        );
      }

      // Prepare Initial Alert Records using Multilingual Template Engine
      const allowUnreviewed = this.configService.get<boolean>('policies.allowUnreviewedTemplates', false);
      const preserveDiacritics = this.configService.get<boolean>('sms.preserveDiacritics', false);
      const areaName = incident.zone?.name || 'your community';

      const alertRows = selection.recipients.map((r) => {
        const rendered = renderAlertTemplate({
          templateType: 'ALERT_VERIFIED_INCIDENT',
          language: r.user.preferredLanguage,
          incidentNumber: incident.number,
          incidentType: incident.type,
          areaName,
          allowUnreviewed,
          preserveDiacritics,
        });

        return {
          incidentId: incident.id,
          userId: r.user.id,
          phoneSnapshot: r.user.phone,
          language: rendered.usedLanguage,
          channel: AlertChannel.SMS,
          message: rendered.text,
          status: AlertStatus.QUEUED,
        };
      });

      if (alertRows.length > 0) {
        await tx.alert.createMany({
          data: alertRows,
          skipDuplicates: true,
        });
      }

      return {
        recipientCount: alertRows.length,
      };
    });

    // 5. Audit Trail
    await this.auditService.log({
      actorId: actor.id,
      action: 'INCIDENT_VERIFIED',
      entityType: 'INCIDENT',
      entityId: incident.id,
      ip,
      userAgent,
      after: {
        number: incident.number,
        status: IncidentStatus.ALERTING,
        verifiedById: actor.id,
        selfVerified: isSelfReporting,
        queuedAlertsCount: result.recipientCount,
      },
    });

    this.logger.log(
      `[INCIDENT_VERIFY] Incident ${incident.number} verified by ${actor.id}. Queued ${result.recipientCount} alerts.`,
    );

    // 6. Asynchronous Queue Enqueueing
    if (this.alertQueueService && result.recipientCount > 0) {
      const queuedAlerts = await this.prisma.alert.findMany({
        where: { incidentId: incident.id, status: AlertStatus.QUEUED },
        include: { user: { select: { role: true } } },
      });

      const queueJobs = queuedAlerts.map((a) => ({
        alertId: a.id,
        incidentId: incident.id,
        userId: a.userId,
        userRole: a.user.role,
        phone: a.phoneSnapshot,
        message: a.message,
        severity: incident.severity,
      }));

      await this.alertQueueService.enqueueBatch(queueJobs);
      this.logger.log(
        `[INCIDENT_VERIFY] Enqueued ${queueJobs.length} alert job(s) for ${incident.number} into dispatch engine.`,
      );
    }

    const refreshed = await this.prisma.incident.findUnique({
      where: { id: incident.id },
      include: {
        reportedBy: { select: { id: true, name: true } },
        verifiedBy: { select: { id: true, name: true } },
        zone: { select: { name: true } },
      },
    });

    return {
      ...this.mapIncidentResponse(refreshed!),
      queuedAlertsCount: result.recipientCount,
    };
  }

  /**
   * Dismisses an incident with mandatory reason (Terminal state).
   */
  async dismissIncident(
    id: string,
    dto: DismissIncidentDto,
    actorId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<IncidentResponseDto> {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) {
      throw new NotFoundException(`Incident with ID ${id} not found.`);
    }

    if (incident.status !== IncidentStatus.PENDING_REVIEW) {
      throw new ConflictException(
        `Incident ${incident.number} is in ${incident.status} status and cannot be dismissed.`,
      );
    }

    const updated = await this.prisma.incident.updateMany({
      where: {
        id,
        status: IncidentStatus.PENDING_REVIEW,
        version: incident.version,
      },
      data: {
        status: IncidentStatus.DISMISSED,
        version: { increment: 1 },
        dismissedById: actorId,
        dismissedAt: new Date(),
        dismissReason: dto.reason.trim(),
      },
    });

    if (updated.count === 0) {
      throw new ConflictException(
        'Concurrent conflict: Incident was modified or processed by another officer.',
      );
    }

    await this.auditService.log({
      actorId,
      action: 'INCIDENT_DISMISSED',
      entityType: 'INCIDENT',
      entityId: id,
      ip,
      userAgent,
      after: {
        number: incident.number,
        status: IncidentStatus.DISMISSED,
        dismissReason: dto.reason.trim(),
        dismissedById: actorId,
      },
    });

    const refreshed = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        reportedBy: { select: { id: true, name: true } },
        dismissedBy: { select: { id: true, name: true } },
        zone: { select: { name: true } },
      },
    });

    return this.mapIncidentResponse(refreshed!);
  }

  /**
   * Resolves an active incident, optionally dispatching an ALL_CLEAR notice.
   */
  async resolveIncident(
    id: string,
    dto: ResolveIncidentDto,
    actorId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<IncidentResponseDto> {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) {
      throw new NotFoundException(`Incident with ID ${id} not found.`);
    }

    if (
      incident.status !== IncidentStatus.ALERTS_SENT &&
      incident.status !== IncidentStatus.ALERTS_PARTIALLY_FAILED &&
      incident.status !== IncidentStatus.ALERTING
    ) {
      throw new ConflictException(
        `Incident ${incident.number} in ${incident.status} status cannot be resolved.`,
      );
    }

    const updated = await this.prisma.incident.updateMany({
      where: {
        id,
        version: incident.version,
      },
      data: {
        status: IncidentStatus.RESOLVED,
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('Concurrent modification conflict while resolving incident.');
    }

    await this.auditService.log({
      actorId,
      action: 'INCIDENT_RESOLVED',
      entityType: 'INCIDENT',
      entityId: id,
      ip,
      userAgent,
      after: {
        number: incident.number,
        status: IncidentStatus.RESOLVED,
        sendAllClear: dto.sendAllClear,
        notes: dto.notes,
      },
    });

    const refreshed = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        reportedBy: { select: { id: true, name: true } },
        verifiedBy: { select: { id: true, name: true } },
        zone: { select: { name: true } },
      },
    });

    return this.mapIncidentResponse(refreshed!);
  }

  /**
   * Paginated listing of incidents with filters.
   */
  async listIncidents(query: IncidentQueryDto): Promise<PaginatedIncidentResponseDto> {
    const { page = 1, limit = 20, status, severity, type, zoneId, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.IncidentWhereInput = {};

    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (type) where.type = type;
    if (zoneId) where.zoneId = zoneId;

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { number: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [incidents, total] = await Promise.all([
      this.prisma.incident.findMany({
        where,
        include: {
          reportedBy: { select: { id: true, name: true } },
          verifiedBy: { select: { id: true, name: true } },
          dismissedBy: { select: { id: true, name: true } },
          zone: { select: { name: true } },
          _count: {
            select: { alerts: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.incident.count({ where }),
    ]);

    return {
      data: incidents.map((inc) => this.mapIncidentResponse(inc)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single incident details by ID.
   */
  async getIncidentById(id: string): Promise<IncidentResponseDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        reportedBy: { select: { id: true, name: true } },
        verifiedBy: { select: { id: true, name: true } },
        dismissedBy: { select: { id: true, name: true } },
        zone: { select: { name: true } },
        _count: {
          select: { alerts: true },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident with ID ${id} not found.`);
    }

    // Aggregate alert status counts
    const alertAggregations = await this.prisma.alert.groupBy({
      by: ['status'],
      where: { incidentId: id },
      _count: { status: true },
    });

    let sent = 0;
    let delivered = 0;
    let failed = 0;
    let total = 0;

    for (const agg of alertAggregations) {
      total += agg._count.status;
      if (agg.status === AlertStatus.SENT) sent += agg._count.status;
      if (agg.status === AlertStatus.DELIVERED) {
        sent += agg._count.status;
        delivered += agg._count.status;
      }
      if (agg.status === AlertStatus.FAILED) failed += agg._count.status;
    }

    const res = this.mapIncidentResponse(incident);
    res.alertStats = { total, sent, delivered, failed };
    return res;
  }

  private mapIncidentResponse(incident: any): IncidentResponseDto {
    return {
      id: incident.id,
      number: incident.number,
      type: incident.type,
      source: incident.source,
      latitude: Number(incident.latitude),
      longitude: Number(incident.longitude),
      zoneId: incident.zoneId || null,
      zoneName: incident.zone?.name || null,
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      alertRadiusMeters: incident.alertRadiusMeters,
      reportedById: incident.reportedById,
      reportedByName: incident.reportedBy?.name,
      verifiedById: incident.verifiedById || null,
      verifiedByName: incident.verifiedBy?.name || null,
      dismissedById: incident.dismissedById || null,
      dismissedByName: incident.dismissedBy?.name || null,
      dismissReason: incident.dismissReason || null,
      verifiedAt: incident.verifiedAt || null,
      dismissedAt: incident.dismissedAt || null,
      alertsCompletedAt: incident.alertsCompletedAt || null,
      version: incident.version,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    };
  }
}

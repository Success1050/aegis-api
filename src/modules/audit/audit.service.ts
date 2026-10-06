import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { maskPhone } from '../../common/utils/pii.util';
import { Prisma } from '@prisma/client';

export interface CreateAuditLogParams {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export interface QueryAuditLogsParams {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append-only write for security and compliance audits.
   * Never throws to avoid blocking core domain actions if audit fails.
   */
  async log(params: CreateAuditLogParams): Promise<void> {
    try {
      // Sanitize PII before persisting to audit log
      const sanitizedBefore = this.sanitizeJson(params.before);
      const sanitizedAfter = this.sanitizeJson(params.after);

      // Ensure actorId is a valid UUID for PostgreSQL @db.Uuid column
      const isUuid =
        params.actorId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.actorId);

      await this.prisma.auditLog.create({
        data: {
          actorId: isUuid ? params.actorId : null,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          before: sanitizedBefore ? (sanitizedBefore as Prisma.InputJsonValue) : Prisma.JsonNull,
          after: sanitizedAfter ? (sanitizedAfter as Prisma.InputJsonValue) : Prisma.JsonNull,
          ip: params.ip || null,
          userAgent: params.userAgent || null,
        },
      });

      this.logger.log(
        `[AUDIT] Action: ${params.action} | Entity: ${params.entityType}:${params.entityId} | Actor: ${params.actorId || 'SYSTEM'}`,
      );
    } catch (error) {
      this.logger.error(`Failed to record audit log: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  /**
   * Query append-only audit trail (Admin only).
   */
  async queryLogs(params: QueryAuditLogsParams) {
    const limit = Math.min(params.limit || 50, 100);
    const offset = params.offset || 0;

    const where: Prisma.AuditLogWhereInput = {
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(params.actorId ? { actorId: params.actorId } : {}),
      ...(params.action ? { action: params.action } : {}),
    };

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + logs.length < total,
      },
    };
  }

  /**
   * Masks sensitive PII fields (phone numbers, passwords) in audit snapshots.
   */
  private sanitizeJson(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;

    const record = Array.isArray(obj) ? [...obj] : { ...(obj as Record<string, unknown>) };

    for (const [key, val] of Object.entries(record)) {
      if (typeof val === 'string') {
        if (key.toLowerCase().includes('password') || key.toLowerCase().includes('hash')) {
          (record as Record<string, unknown>)[key] = '[REDACTED]';
        } else if (key.toLowerCase().includes('phone')) {
          (record as Record<string, unknown>)[key] = maskPhone(val);
        }
      } else if (val && typeof val === 'object') {
        (record as Record<string, unknown>)[key] = this.sanitizeJson(val);
      }
    }

    return record;
  }
}

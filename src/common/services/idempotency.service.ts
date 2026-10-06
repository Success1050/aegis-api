import {
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { createHash } from 'crypto';

export interface IdempotencyCheckResult {
  isHit: boolean;
  cachedResponse?: any;
  cachedStatus?: number;
  saveResponse?: (statusCode: number, response: any) => Promise<void>;
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a deterministic SHA-256 hash from request parameters.
   */
  computeHash(endpoint: string, method: string, actorId: string, body: any): string {
    const raw = `${method}:${endpoint}:${actorId}:${JSON.stringify(body || {})}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Checks whether an idempotency key has already been processed or is new.
   */
  async processKey(
    key: string,
    endpoint: string,
    method: string,
    actorId: string,
    body: any,
  ): Promise<IdempotencyCheckResult> {
    const requestHash = this.computeHash(endpoint, method, actorId, body);
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { key },
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          `Idempotency-Key "${key}" has already been used with a different request payload.`,
        );
      }

      // Check if expired
      if (existing.expiresAt.getTime() > Date.now()) {
        return {
          isHit: true,
          cachedResponse: existing.response,
          cachedStatus: existing.statusCode,
        };
      }
    }

    // Save callback
    const saveResponse = async (statusCode: number, response: any) => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hour retention
      await this.prisma.idempotencyRecord.upsert({
        where: { key },
        update: {
          endpoint,
          requestHash,
          statusCode,
          response: response as any,
          expiresAt,
        },
        create: {
          key,
          endpoint,
          requestHash,
          statusCode,
          response: response as any,
          expiresAt,
        },
      });
    };

    return {
      isHit: false,
      saveResponse,
    };
  }
}

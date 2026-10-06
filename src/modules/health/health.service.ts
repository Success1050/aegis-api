import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import Redis from 'ioredis';

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
}

export interface ReadyCheckResult {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: 'healthy' | 'unhealthy';
    redis: 'healthy' | 'unhealthy';
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  getLiveness(): HealthCheckResult {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async getReadiness(): Promise<ReadyCheckResult> {
    const isDbHealthy = await this.prisma.isHealthy();
    let isRedisHealthy = false;

    try {
      const redisHost = this.configService.get<string>('redis.host', '127.0.0.1');
      const redisPort = this.configService.get<number>('redis.port', 6379);
      const redisPassword = this.configService.get<string | undefined>('redis.password');

      const client = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        connectTimeout: 2000,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });

      await client.connect();
      const pingRes = await client.ping();
      isRedisHealthy = pingRes === 'PONG';
      await client.quit();
    } catch {
      isRedisHealthy = false;
    }

    const overallReady = isDbHealthy; // In local dev without redis, ready check reports state

    return {
      status: overallReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: isDbHealthy ? 'healthy' : 'unhealthy',
        redis: isRedisHealthy ? 'healthy' : 'unhealthy',
      },
    };
  }
}

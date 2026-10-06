import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { Role, Severity } from '@prisma/client';
import { AlertJobData, ALERT_QUEUE_NAME } from './alert-queue.types';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

function calculateJobPriority(role: Role, severity: Severity): number {
  const roleBase = role === Role.SECURITY ? 10 : 20;
  let severityOffset = 3;
  switch (severity) {
    case Severity.CRITICAL:
      severityOffset = 0;
      break;
    case Severity.HIGH:
      severityOffset = 1;
      break;
    case Severity.MEDIUM:
      severityOffset = 2;
      break;
    case Severity.LOW:
      severityOffset = 3;
      break;
  }
  return roleBase + severityOffset;
}

@Injectable()
export class AlertQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertQueueService.name);
  private queue: Queue<AlertJobData> | null = null;
  private redisClient: Redis | null = null;
  private isRedisAvailable = false;
  private inMemoryQueue: AlertJobData[] = [];
  private inMemoryProcessing = false;
  private isQueuePaused = false;

  // Handler delegate registered by AlertWorker
  private workerHandler: ((data: AlertJobData) => Promise<void>) | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  async onModuleInit() {
    await this.initQueue();
  }

  async onModuleDestroy() {
    if (this.queue) {
      await this.queue.close();
    }
    if (this.redisClient) {
      this.redisClient.disconnect();
    }
  }

  private async initQueue() {
    const redisHost = this.configService.get<string>('redis.host', '127.0.0.1');
    const redisPort = this.configService.get<number>('redis.port', 6379);
    const redisPassword = this.configService.get<string>('redis.password');

    try {
      this.redisClient = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: () => null, // Do not spam retries if redis is not running
        connectTimeout: 2000,
        lazyConnect: true,
      });

      await this.redisClient.connect();
      await this.redisClient.ping();

      this.isRedisAvailable = true;
      this.logger.log(`[AlertQueue] Successfully connected to Redis at ${redisHost}:${redisPort}. BullMQ active.`);

      this.queue = new Queue(ALERT_QUEUE_NAME, {
        connection: this.redisClient,
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 5000, // 5s, 20s, 1m, 5m, 15m
          },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      });
    } catch (err: any) {
      this.isRedisAvailable = false;
      this.logger.warn(
        `[AlertQueue] Redis unavailable (${err.message}). Activating In-Memory Fallback Queue engine with priority dispatch.`,
      );
    }
  }

  registerWorkerHandler(handler: (data: AlertJobData) => Promise<void>) {
    this.workerHandler = handler;
  }

  async enqueueAlert(data: AlertJobData): Promise<void> {
    const priority = calculateJobPriority(data.userRole, data.severity);

    if (this.isRedisAvailable && this.queue) {
      await this.queue.add(`alert-${data.alertId}`, data, {
        priority,
        jobId: data.alertId,
      });
      return;
    }

    // Fallback: In-memory priority queue
    this.inMemoryQueue.push(data);
    // Sort ascending by priority: lower number = higher priority
    this.inMemoryQueue.sort(
      (a, b) =>
        calculateJobPriority(a.userRole, a.severity) -
        calculateJobPriority(b.userRole, b.severity),
    );

    this.triggerInMemoryProcessor();
  }

  async enqueueBatch(jobs: AlertJobData[]): Promise<void> {
    if (jobs.length === 0) return;

    if (this.isRedisAvailable && this.queue) {
      const bullJobs = jobs.map((data) => ({
        name: `alert-${data.alertId}`,
        data,
        opts: {
          priority: calculateJobPriority(data.userRole, data.severity),
          jobId: data.alertId,
        },
      }));
      await this.queue.addBulk(bullJobs);
      return;
    }

    for (const job of jobs) {
      this.inMemoryQueue.push(job);
    }

    this.inMemoryQueue.sort(
      (a, b) =>
        calculateJobPriority(a.userRole, a.severity) -
        calculateJobPriority(b.userRole, b.severity),
    );

    this.triggerInMemoryProcessor();
  }

  private triggerInMemoryProcessor() {
    if (this.inMemoryProcessing) return;
    this.inMemoryProcessing = true;

    setImmediate(async () => {
      while (this.inMemoryQueue.length > 0) {
        if (this.isQueuePaused || this.circuitBreaker.isOpen()) {
          this.logger.warn('[AlertQueue] Queue processing halted: Circuit breaker is OPEN or queue is paused.');
          break;
        }

        const nextJob = this.inMemoryQueue.shift();
        if (!nextJob) break;

        if (this.workerHandler) {
          try {
            await this.workerHandler(nextJob);
          } catch (err: any) {
            this.logger.error(`[AlertQueue] Fallback worker error on alert ${nextJob.alertId}: ${err.message}`);
          }
        }
      }
      this.inMemoryProcessing = false;
    });
  }

  async pauseQueue(): Promise<void> {
    this.isQueuePaused = true;
    if (this.queue) {
      await this.queue.pause();
    }
    this.logger.warn('[AlertQueue] Dispatch queue PAUSED.');
  }

  async resumeQueue(): Promise<void> {
    this.isQueuePaused = false;
    if (this.queue) {
      await this.queue.resume();
    }
    this.logger.log('[AlertQueue] Dispatch queue RESUMED.');
    if (!this.isRedisAvailable) {
      this.triggerInMemoryProcessor();
    }
  }

  isPaused(): boolean {
    return this.isQueuePaused || this.circuitBreaker.isOpen();
  }

  getQueueStats() {
    return {
      engine: this.isRedisAvailable ? 'BullMQ (Redis)' : 'In-Memory (Fallback)',
      isPaused: this.isPaused(),
      pendingInMemoryCount: this.inMemoryQueue.length,
    };
  }

  getRedisClient(): Redis | null {
    return this.redisClient;
  }

  isUsingRedis(): boolean {
    return this.isRedisAvailable;
  }
}

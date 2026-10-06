import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private state: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private lastFailureTime: number | null = null;
  private trippedAt: number | null = null;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.failureThreshold = this.configService.get<number>(
      'CIRCUIT_BREAKER_THRESHOLD',
      10,
    );
    this.resetTimeoutMs = this.configService.get<number>(
      'CIRCUIT_BREAKER_RESET_MS',
      60000, // 1 minute auto-test
    );
  }

  getState(): CircuitBreakerState {
    if (this.state === 'OPEN' && this.trippedAt) {
      if (Date.now() - this.trippedAt > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.logger.warn('[CircuitBreaker] Transitioned from OPEN to HALF_OPEN (probing provider recovery).');
      }
    }
    return this.state;
  }

  isOpen(): boolean {
    return this.getState() === 'OPEN';
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.trippedAt = null;
      this.logger.log('[CircuitBreaker] Provider recovered. Circuit reset to CLOSED.');
    }
  }

  recordFailure(reason?: string): boolean {
    this.consecutiveFailures += 1;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.trippedAt = Date.now();
      this.logger.error(
        `[CircuitBreaker] Probe failure during HALF_OPEN. Circuit re-opened. Reason: ${reason || 'Unknown'}`,
      );
      return true;
    }

    if (this.consecutiveFailures >= this.failureThreshold && this.state === 'CLOSED') {
      this.state = 'OPEN';
      this.trippedAt = Date.now();
      this.logger.error(
        `[CircuitBreaker] TRIPPED! ${this.consecutiveFailures} consecutive SMS dispatch failures. Pausing queue to prevent blast damage. Reason: ${reason || 'Provider Outage'}`,
      );
      return true;
    }

    return false;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.trippedAt = null;
    this.logger.log('[CircuitBreaker] Manually reset to CLOSED.');
  }

  getMetrics() {
    return {
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: this.failureThreshold,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      trippedAt: this.trippedAt ? new Date(this.trippedAt).toISOString() : null,
    };
  }
}

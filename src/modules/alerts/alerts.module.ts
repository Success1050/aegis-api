import { Module, forwardRef } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertQueueService } from './queue/alert-queue.service';
import { AlertWorker } from './queue/alert-queue.worker';
import { AlertReconcilerService } from './reconciler/alert-reconciler.service';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [AlertsController],
  providers: [
    AlertsService,
    CircuitBreakerService,
    AlertQueueService,
    AlertWorker,
    AlertReconcilerService,
  ],
  exports: [
    AlertsService,
    CircuitBreakerService,
    AlertQueueService,
    AlertWorker,
    AlertReconcilerService,
  ],
})
export class AlertsModule {}

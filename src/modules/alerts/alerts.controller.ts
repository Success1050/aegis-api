import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles, CurrentUser, AuthenticatedUser } from '../../common';
import { AlertsService } from './alerts.service';
import { PreviewTemplateDto } from './dto/preview-template.dto';
import { AlertReconcilerService } from './reconciler/alert-reconciler.service';
import { AlertQueueService } from './queue/alert-queue.service';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';

@ApiTags('Alerts')
@ApiBearerAuth('JWT-auth')
@Controller()
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly reconcilerService: AlertReconcilerService,
    private readonly queueService: AlertQueueService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  @Post('alerts/preview-template')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SECURITY, Role.RESIDENT)
  @ApiOperation({
    summary: 'Preview an alert template rendered in a target language with GSM-7 segment analysis',
  })
  @ApiResponse({
    status: 200,
    description: 'Rendered template and encoding analysis',
  })
  previewTemplate(@Body() dto: PreviewTemplateDto) {
    return this.alertsService.previewTemplate(dto);
  }

  @Get('incidents/:id/alerts')
  @Roles(Role.ADMIN, Role.SECURITY)
  @ApiOperation({
    summary: 'Retrieve all alerts created for an incident',
  })
  @ApiParam({ name: 'id', description: 'Incident UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of alerts dispatched for incident',
  })
  async getAlertsByIncident(@Param('id') id: string) {
    return this.alertsService.getAlertsByIncident(id);
  }

  @Get('incidents/:id/alerts/stats')
  @Roles(Role.ADMIN, Role.SECURITY)
  @ApiOperation({
    summary: 'Retrieve aggregated delivery statistics for an incident',
  })
  @ApiParam({ name: 'id', description: 'Incident UUID' })
  @ApiResponse({
    status: 200,
    description: 'Aggregated alert delivery statistics',
  })
  async getAlertsStats(@Param('id') id: string) {
    return this.alertsService.getAlertsStats(id);
  }

  @Post('incidents/:id/alerts/retry-failed')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SECURITY)
  @ApiOperation({
    summary: 'Manually trigger re-dispatch for failed alerts of an incident',
  })
  @ApiParam({ name: 'id', description: 'Incident UUID' })
  @ApiResponse({
    status: 200,
    description: 'Failed alerts reset to QUEUED and re-enqueued',
  })
  async retryFailedAlerts(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.reconcilerService.retryFailedAlerts(id, user.id, ip, userAgent);
  }

  @Get('alerts/queue/stats')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Inspect BullMQ / In-Memory alert queue status and metrics' })
  getQueueStats() {
    return this.queueService.getQueueStats();
  }

  @Post('alerts/queue/pause')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Emergency pause on alert dispatch queue' })
  async pauseQueue() {
    await this.queueService.pauseQueue();
    return { success: true, message: 'Queue paused' };
  }

  @Post('alerts/queue/resume')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Resume alert dispatch queue' })
  async resumeQueue() {
    await this.queueService.resumeQueue();
    return { success: true, message: 'Queue resumed' };
  }

  @Get('alerts/circuit-breaker')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get current circuit breaker status for SMS providers' })
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getMetrics();
  }

  @Post('alerts/circuit-breaker/reset')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Manually reset circuit breaker' })
  resetCircuitBreaker() {
    this.circuitBreaker.reset();
    return { success: true, message: 'Circuit breaker reset to CLOSED' };
  }
}

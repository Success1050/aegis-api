import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('System & Health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'System index', description: 'Returns system metadata and documentation URLs.' })
  @ApiResponse({ status: 200, description: 'System metadata' })
  getRoot() {
    return {
      system: 'AEGIS Community Early-Warning System',
      phase: 'Phase 1 - Manual Early-Warning System',
      version: '1.0.0',
      status: 'operational',
      docs: '/api/docs',
      health: '/health',
      ready: '/ready',
      apiPrefix: '/api/v1',
    };
  }

  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe', description: 'Returns 200 if the process is running.' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  getHealth() {
    return this.healthService.getLiveness();
  }

  @Public()
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Checks database and Redis dependencies. Returns 200 if ready, 503 if not.',
  })
  @ApiResponse({ status: 200, description: 'Dependencies are healthy' })
  @ApiResponse({ status: 503, description: 'One or more critical dependencies are down' })
  async getReady(@Res({ passthrough: true }) res: Response) {
    const result = await this.healthService.getReadiness();
    if (result.status !== 'ready') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Res,
  Headers,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { IncidentsService } from './incidents.service';
import { IdempotencyService } from '../../common/services/idempotency.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { VerifyIncidentDto } from './dto/verify-incident.dto';
import { DismissIncidentDto } from './dto/dismiss-incident.dto';
import { ResolveIncidentDto } from './dto/resolve-incident.dto';
import { IncidentQueryDto } from './dto/incident-query.dto';
import {
  IncidentResponseDto,
  PaginatedIncidentResponseDto,
} from './dto/incident-response.dto';
import { RecipientPreviewResponseDto } from './dto/recipient-preview.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Incidents')
@ApiBearerAuth('JWT-auth')
@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post()
  @Roles('SECURITY', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Report a new incident',
    description:
      'Initializes an incident in PENDING_REVIEW status. Never auto-alerts. Checks for duplicate incidents within 500m in the last 30 minutes.',
  })
  @ApiResponse({ status: 201, type: IncidentResponseDto })
  @ApiResponse({ status: 409, description: 'Possible duplicate incident detected' })
  async createIncident(
    @Body() dto: CreateIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<IncidentResponseDto> {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.incidentsService.createIncident(dto, user, ip, userAgent);
  }

  @Get()
  @ApiOperation({ summary: 'Paginated list of incidents with status and severity filters' })
  @ApiResponse({ status: 200, type: PaginatedIncidentResponseDto })
  async listIncidents(@Query() query: IncidentQueryDto): Promise<PaginatedIncidentResponseDto> {
    return this.incidentsService.listIncidents(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get incident details with verifier and delivery stats' })
  @ApiResponse({ status: 200, type: IncidentResponseDto })
  @ApiResponse({ status: 404, description: 'Incident not found' })
  async getIncidentById(@Param('id', ParseUUIDPipe) id: string): Promise<IncidentResponseDto> {
    return this.incidentsService.getIncidentById(id);
  }

  @Get(':id/preview-recipients')
  @Roles('SECURITY', 'ADMIN')
  @ApiOperation({
    summary: 'Dry-run recipient preview before verification',
    description:
      'Calculates recipient count and breakdown by language, role, and physical vs. zone match before triggering an alert broadcast.',
  })
  @ApiResponse({ status: 200, type: RecipientPreviewResponseDto })
  @ApiResponse({ status: 404, description: 'Incident not found' })
  async previewRecipients(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecipientPreviewResponseDto> {
    return this.incidentsService.previewRecipients(id);
  }

  @Post(':id/verify')
  @Roles('SECURITY', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify incident and trigger alert fanout',
    description:
      'Enforces Four-Eyes principle (reporter cannot verify unless Admin override), transitions atomically to ALERTING, and enqueues alert rows in a single DB transaction.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Unique client idempotency token to prevent double-verification',
  })
  @ApiResponse({ status: 200, description: 'Incident verified and alerting initiated' })
  @ApiResponse({ status: 403, description: 'Four-Eyes Principle violation' })
  @ApiResponse({ status: 409, description: 'State conflict or incident expired' })
  async verifyIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IncidentResponseDto & { queuedAlertsCount: number }> {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Idempotency Protection Check
    if (idempotencyKey) {
      const check = await this.idempotencyService.processKey(
        idempotencyKey,
        `/api/v1/incidents/${id}/verify`,
        'POST',
        user.id,
        dto,
      );

      if (check.isHit) {
        res.setHeader('X-Cache', 'HIT');
        return check.cachedResponse;
      }

      const result = await this.incidentsService.verifyIncident(id, dto, user, ip, userAgent);
      if (check.saveResponse) {
        await check.saveResponse(HttpStatus.OK, result);
      }
      return result;
    }

    return this.incidentsService.verifyIncident(id, dto, user, ip, userAgent);
  }

  @Post(':id/dismiss')
  @Roles('SECURITY', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dismiss incident with mandatory reason',
    description: 'Permanently dismisses a pending report. A dismissed incident can never be verified.',
  })
  @ApiResponse({ status: 200, type: IncidentResponseDto })
  @ApiResponse({ status: 409, description: 'Incident already processed' })
  async dismissIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DismissIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<IncidentResponseDto> {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.incidentsService.dismissIncident(id, dto, user.id, ip, userAgent);
  }

  @Post(':id/resolve')
  @Roles('SECURITY', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve incident',
    description: 'Sets incident to RESOLVED status. Optionally broadcasts an ALL_CLEAR notice to recipients.',
  })
  @ApiResponse({ status: 200, type: IncidentResponseDto })
  @ApiResponse({ status: 409, description: 'Incident cannot be resolved from current state' })
  async resolveIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<IncidentResponseDto> {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.incidentsService.resolveIncident(id, dto, user.id, ip, userAgent);
  }
}

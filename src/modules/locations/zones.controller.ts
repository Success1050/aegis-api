import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { ZonesService } from './zones.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ZoneResponseDto } from './dto/zone-response.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Zones')
@ApiBearerAuth('JWT-auth')
@Controller('zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Get()
  @ApiOperation({ summary: 'List all community zones with membership counts' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiResponse({ status: 200, type: [ZoneResponseDto] })
  async listZones(@Query('includeInactive') includeInactive?: string): Promise<ZoneResponseDto[]> {
    return this.zonesService.listZones(includeInactive === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get zone details by ID' })
  @ApiResponse({ status: 200, type: ZoneResponseDto })
  @ApiResponse({ status: 404, description: 'Zone not found' })
  async getZoneById(@Param('id', ParseUUIDPipe) id: string): Promise<ZoneResponseDto> {
    return this.zonesService.getZoneById(id);
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new community zone (Admin only)' })
  @ApiResponse({ status: 201, type: ZoneResponseDto })
  async createZone(
    @Body() dto: CreateZoneDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<ZoneResponseDto> {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.zonesService.createZone(dto, user.id, ip, userAgent);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update community zone details (Admin only)' })
  @ApiResponse({ status: 200, type: ZoneResponseDto })
  @ApiResponse({ status: 404, description: 'Zone not found' })
  async updateZone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateZoneDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<ZoneResponseDto> {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.zonesService.updateZone(id, dto, user.id, ip, userAgent);
  }
}

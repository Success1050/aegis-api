import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ZoneResponseDto } from './dto/zone-response.dto';
import { validateCoordinates } from '../../common/utils/coordinate.util';

@Injectable()
export class ZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listZones(includeInactive = false): Promise<ZoneResponseDto[]> {
    const zones = await this.prisma.zone.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        _count: {
          select: { users: { where: { isActive: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    return zones.map((z) => ({
      id: z.id,
      name: z.name,
      centerLat: Number(z.centerLat),
      centerLng: Number(z.centerLng),
      radiusMeters: z.radiusMeters,
      isActive: z.isActive,
      memberCount: z._count.users,
      createdAt: z.createdAt,
      updatedAt: z.updatedAt,
    }));
  }

  async getZoneById(id: string): Promise<ZoneResponseDto> {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: { where: { isActive: true } } },
        },
      },
    });

    if (!zone) {
      throw new NotFoundException(`Zone with ID ${id} not found.`);
    }

    return {
      id: zone.id,
      name: zone.name,
      centerLat: Number(zone.centerLat),
      centerLng: Number(zone.centerLng),
      radiusMeters: zone.radiusMeters,
      isActive: zone.isActive,
      memberCount: zone._count.users,
      createdAt: zone.createdAt,
      updatedAt: zone.updatedAt,
    };
  }

  async createZone(
    dto: CreateZoneDto,
    actorId?: string,
    ip?: string,
    userAgent?: string,
  ): Promise<ZoneResponseDto> {
    validateCoordinates(dto.centerLat, dto.centerLng);

    const zone = await this.prisma.zone.create({
      data: {
        name: dto.name.trim(),
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        radiusMeters: dto.radiusMeters ?? 2000,
        isActive: dto.isActive ?? true,
      },
    });

    await this.auditService.log({
      actorId,
      action: 'ZONE_CREATED',
      entityType: 'ZONE',
      entityId: zone.id,
      ip,
      userAgent,
      after: {
        name: zone.name,
        centerLat: Number(zone.centerLat),
        centerLng: Number(zone.centerLng),
        radiusMeters: zone.radiusMeters,
      },
    });

    return {
      id: zone.id,
      name: zone.name,
      centerLat: Number(zone.centerLat),
      centerLng: Number(zone.centerLng),
      radiusMeters: zone.radiusMeters,
      isActive: zone.isActive,
      memberCount: 0,
      createdAt: zone.createdAt,
      updatedAt: zone.updatedAt,
    };
  }

  async updateZone(
    id: string,
    dto: UpdateZoneDto,
    actorId?: string,
    ip?: string,
    userAgent?: string,
  ): Promise<ZoneResponseDto> {
    const existing = await this.prisma.zone.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Zone with ID ${id} not found.`);
    }

    if (dto.centerLat !== undefined || dto.centerLng !== undefined) {
      const lat = dto.centerLat !== undefined ? dto.centerLat : Number(existing.centerLat);
      const lng = dto.centerLng !== undefined ? dto.centerLng : Number(existing.centerLng);
      validateCoordinates(lat, lng);
    }

    const updated = await this.prisma.zone.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        centerLat: dto.centerLat !== undefined ? dto.centerLat : undefined,
        centerLng: dto.centerLng !== undefined ? dto.centerLng : undefined,
        radiusMeters: dto.radiusMeters !== undefined ? dto.radiusMeters : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
      include: {
        _count: {
          select: { users: { where: { isActive: true } } },
        },
      },
    });

    await this.auditService.log({
      actorId,
      action: 'ZONE_UPDATED',
      entityType: 'ZONE',
      entityId: updated.id,
      ip,
      userAgent,
      before: {
        name: existing.name,
        centerLat: Number(existing.centerLat),
        centerLng: Number(existing.centerLng),
        radiusMeters: existing.radiusMeters,
        isActive: existing.isActive,
      },
      after: {
        name: updated.name,
        centerLat: Number(updated.centerLat),
        centerLng: Number(updated.centerLng),
        radiusMeters: updated.radiusMeters,
        isActive: updated.isActive,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      centerLat: Number(updated.centerLat),
      centerLng: Number(updated.centerLng),
      radiusMeters: updated.radiusMeters,
      isActive: updated.isActive,
      memberCount: updated._count.users,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}

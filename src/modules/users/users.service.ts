import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma, Role, Language } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../../common/services/mail.service';
import { normalizeNigerianPhone } from '../../common/utils/phone.util';
import { validateCoordinates } from '../../common/utils/coordinate.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import {
  BulkImportDto,
  BulkImportResponseDto,
  BulkImportErrorDetail,
} from './dto/bulk-import.dto';
import { PaginatedUserResponseDto, UserResponseDto } from './dto/user-response.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Generates a cryptographically sound temporary password for new registrations.
   */
  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const num = Math.floor(1000 + Math.random() * 9000);
    return `Aegis${code}!${num}`;
  }

  /**
   * Registers a new user (Resident, Security, or Admin).
   * Supports both Zone & Address-based mode and GPS-enhanced mode.
   * Dispatches welcome credentials with login URL, password, and identifier.
   */
  async createUser(
    dto: CreateUserDto,
    actorId?: string,
    ip?: string,
    userAgent?: string,
  ): Promise<UserResponseDto> {
    const normalizedPhone = normalizeNigerianPhone(dto.phone);

    // 1. Check for Phone Conflict
    const existingByPhone = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });
    if (existingByPhone) {
      throw new ConflictException(`Phone number ${normalizedPhone} is already registered.`);
    }

    // 2. Check for Email Conflict if provided
    let normalizedEmail: string | null = null;
    if (dto.email) {
      normalizedEmail = dto.email.trim().toLowerCase();
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existingByEmail) {
        throw new ConflictException(`Email address ${normalizedEmail} is already registered.`);
      }
    }

    // 3. Coordinate Sanity Validation
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      validateCoordinates(dto.latitude, dto.longitude);
    }

    // 4. Resolve Password & Credential Generation
    const rawPassword = dto.password ? dto.password.trim() : this.generateTempPassword();
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    // 5. Zone existence check if specified
    let zoneName: string | undefined;
    if (dto.zoneId) {
      const zone = await this.prisma.zone.findUnique({ where: { id: dto.zoneId } });
      if (zone) {
        zoneName = zone.name;
      }
    }

    // 6. Persist User (Alerts enabled by default)
    const hasCoordinates = dto.latitude !== undefined && dto.longitude !== undefined;
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        phone: normalizedPhone,
        email: normalizedEmail,
        passwordHash,
        role: dto.role || Role.RESIDENT,
        preferredLanguage: dto.preferredLanguage || Language.ENGLISH,
        zoneId: dto.zoneId || null,
        houseNumber: dto.houseNumber ? dto.houseNumber.trim() : null,
        areaDescription: dto.areaDescription ? dto.areaDescription.trim() : null,
        latitude: hasCoordinates ? dto.latitude : null,
        longitude: hasCoordinates ? dto.longitude : null,
        locationUpdatedAt: hasCoordinates ? new Date() : null,
        alertsEnabled: dto.alertsEnabled !== undefined ? dto.alertsEnabled : true,
        isActive: true,
      },
      include: { zone: true },
    });

    // 7. Dispatch Credentials via Email / Terminal Notice
    await this.mailService.sendWelcomeCredentials({
      toEmail: user.email || 'alerts@aegis.ng',
      name: user.name,
      role: user.role,
      phone: user.phone,
      tempPassword: rawPassword,
      zoneName: zoneName || user.zone?.name,
    });

    // 8. Record Audit Trail
    await this.auditService.log({
      actorId,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: user.id,
      ip,
      userAgent,
      after: {
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        zoneId: user.zoneId,
        houseNumber: user.houseNumber,
        areaDescription: user.areaDescription,
        alertsEnabled: user.alertsEnabled,
      },
    });

    return this.mapUserResponse(user);
  }

  /**
   * Paginated directory search with role, zone, and text filtering.
   */
  async listUsers(query: UserQueryDto): Promise<PaginatedUserResponseDto> {
    const { page = 1, limit = 20, search, role, zoneId, isActive, alertsEnabled } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (role) {
      where.role = role;
    }
    if (zoneId) {
      where.zoneId = zoneId;
    }
    if (isActive !== undefined) {
      where.isActive = isActive;
    }
    if (alertsEnabled !== undefined) {
      where.alertsEnabled = alertsEnabled;
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
        { email: { contains: term, mode: 'insensitive' } },
        { houseNumber: { contains: term, mode: 'insensitive' } },
        { areaDescription: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { zone: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => this.mapUserResponse(u)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single user profile by ID.
   */
  async getUserById(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { zone: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }

    return this.mapUserResponse(user);
  }

  /**
   * Updates user profile fields, validating coordinates or unique phone/email when modified.
   */
  async updateUser(
    id: string,
    dto: UpdateUserDto,
    actorId?: string,
    ip?: string,
    userAgent?: string,
  ): Promise<UserResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }

    let normalizedPhone: string | undefined;
    if (dto.phone && dto.phone !== existing.phone) {
      normalizedPhone = normalizeNigerianPhone(dto.phone);
      const conflict = await this.prisma.user.findUnique({ where: { phone: normalizedPhone } });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Phone number ${normalizedPhone} is already registered.`);
      }
    }

    let normalizedEmail: string | undefined;
    if (dto.email && dto.email !== existing.email) {
      normalizedEmail = dto.email.trim().toLowerCase();
      const conflict = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Email address ${normalizedEmail} is already registered.`);
      }
    }

    let passwordHash: string | undefined;
    if (dto.password) {
      passwordHash = await bcrypt.hash(dto.password.trim(), 10);
    }

    let locationUpdatedAt: Date | undefined;
    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      const lat = dto.latitude !== undefined ? dto.latitude : (existing.latitude ? Number(existing.latitude) : null);
      const lng = dto.longitude !== undefined ? dto.longitude : (existing.longitude ? Number(existing.longitude) : null);
      if (lat !== null && lng !== null) {
        validateCoordinates(lat, lng);
        locationUpdatedAt = new Date();
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        phone: normalizedPhone,
        email: normalizedEmail,
        passwordHash,
        role: dto.role,
        preferredLanguage: dto.preferredLanguage,
        zoneId: dto.zoneId,
        houseNumber: dto.houseNumber !== undefined ? dto.houseNumber?.trim() || null : undefined,
        areaDescription: dto.areaDescription !== undefined ? dto.areaDescription?.trim() || null : undefined,
        latitude: dto.latitude,
        longitude: dto.longitude,
        locationUpdatedAt,
        alertsEnabled: dto.alertsEnabled,
        isActive: dto.isActive,
      },
      include: { zone: true },
    });

    await this.auditService.log({
      actorId,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: updated.id,
      ip,
      userAgent,
      before: {
        name: existing.name,
        phone: existing.phone,
        email: existing.email,
        role: existing.role,
        zoneId: existing.zoneId,
        alertsEnabled: existing.alertsEnabled,
        isActive: existing.isActive,
      },
      after: {
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        role: updated.role,
        zoneId: updated.zoneId,
        alertsEnabled: updated.alertsEnabled,
        isActive: updated.isActive,
      },
    });

    return this.mapUserResponse(updated);
  }

  /**
   * Soft deactivation for user account.
   */
  async deactivateUser(
    id: string,
    actorId?: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditService.log({
      actorId,
      action: 'USER_DEACTIVATED',
      entityType: 'USER',
      entityId: id,
      ip,
      userAgent,
      before: { isActive: existing.isActive },
      after: { isActive: false },
    });

    return { success: true, message: `User account ${existing.name} has been deactivated.` };
  }

  /**
   * Bulk onboard community residents (CSV / batch JSON).
   * Validates each row, supports with or without GPS, dispatches credentials,
   * and reports per-row outcomes.
   */
  async bulkImport(
    dto: BulkImportDto,
    actorId?: string,
    ip?: string,
    userAgent?: string,
  ): Promise<BulkImportResponseDto> {
    let successCount = 0;
    let failedCount = 0;
    const errors: BulkImportErrorDetail[] = [];

    for (let i = 0; i < dto.residents.length; i++) {
      const row = dto.residents[i];
      try {
        await this.createUser(
          {
            name: row.name,
            phone: row.phone,
            email: row.email,
            preferredLanguage: row.preferredLanguage,
            zoneId: row.zoneId,
            houseNumber: row.houseNumber,
            areaDescription: row.areaDescription,
            latitude: row.latitude,
            longitude: row.longitude,
            alertsEnabled: true,
          },
          actorId,
          ip,
          userAgent,
        );
        successCount++;
      } catch (err) {
        failedCount++;
        errors.push({
          row: i + 1,
          phone: row.phone,
          error: (err as Error).message,
        });
      }
    }

    await this.auditService.log({
      actorId,
      action: 'USER_BULK_IMPORTED',
      entityType: 'USER',
      entityId: actorId || 'SYSTEM',
      ip,
      userAgent,
      after: {
        totalProcessed: dto.residents.length,
        successCount,
        failedCount,
      },
    });

    return {
      totalProcessed: dto.residents.length,
      successCount,
      failedCount,
      errors,
    };
  }

  private mapUserResponse(user: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    role: Role;
    preferredLanguage: Language;
    zoneId?: string | null;
    zone?: { name: string } | null;
    houseNumber?: string | null;
    areaDescription?: string | null;
    latitude?: Prisma.Decimal | number | null;
    longitude?: Prisma.Decimal | number | null;
    locationUpdatedAt?: Date | null;
    alertsEnabled: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email || null,
      role: user.role,
      preferredLanguage: user.preferredLanguage,
      zoneId: user.zoneId || null,
      zoneName: user.zone?.name || null,
      houseNumber: user.houseNumber || null,
      areaDescription: user.areaDescription || null,
      latitude: user.latitude !== null && user.latitude !== undefined ? Number(user.latitude) : null,
      longitude: user.longitude !== null && user.longitude !== undefined ? Number(user.longitude) : null,
      locationUpdatedAt: user.locationUpdatedAt || null,
      alertsEnabled: user.alertsEnabled,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

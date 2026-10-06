import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto, DashboardRoutingDto, UserProfileDto } from './dto/auth-response.dto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

interface FailedAttemptTracker {
  count: number;
  lockedUntil?: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // In-memory rate limiting / lockout store: phone -> attempt tracking
  private readonly failedLogins = new Map<string, FailedAttemptTracker>();

  // In-memory active refresh token store: jti -> { userId, expiresAt }
  private readonly activeRefreshTokens = new Map<string, { userId: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Normalizes Nigerian phone input to strict E.164 (+234...).
   */
  normalizePhone(input: string): string {
    const raw = input.trim();
    const parsed = parsePhoneNumberFromString(raw, 'NG');
    if (parsed && parsed.isValid()) {
      return parsed.format('E.164');
    }

    // Fallback: clean digits and format if already 234 or 0-prefixed
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 11) {
      return `+234${digits.substring(1)}`;
    }
    if (digits.startsWith('234') && digits.length === 13) {
      return `+${digits}`;
    }
    if (raw.startsWith('+234') && raw.length === 14) {
      return raw;
    }

    throw new UnauthorizedException('Invalid Nigerian phone number format.');
  }

  /**
   * Authenticates user, checks rate limits, returns tokens & role dashboard metadata.
   */
  async login(dto: LoginDto, ip?: string, userAgent?: string): Promise<AuthResponseDto> {
    const rawIdentifier = (dto.identifier || dto.email || dto.phone || '').trim();
    if (!rawIdentifier) {
      throw new UnauthorizedException('Please provide a valid phone number or email address.');
    }

    const isEmail = rawIdentifier.includes('@') || Boolean(dto.email);
    let lookupKey = rawIdentifier.toLowerCase();
    let normalizedPhone: string | null = null;

    if (!isEmail) {
      normalizedPhone = this.normalizePhone(rawIdentifier);
      lookupKey = normalizedPhone;
    }

    // 1. Check Brute-Force Lockout
    this.checkBruteForceLockout(lookupKey);

    // 2. Fetch User
    const user = await this.prisma.user.findFirst({
      where: isEmail ? { email: lookupKey } : { phone: lookupKey },
      include: { zone: true },
    });

    if (!user || !user.isActive) {
      this.recordFailedAttempt(lookupKey);
      await this.auditService.log({
        action: 'USER_LOGIN_FAILED',
        entityType: 'USER',
        entityId: lookupKey,
        ip,
        userAgent,
        after: { reason: 'User not found or inactive' },
      });
      throw new UnauthorizedException('Invalid login credentials.');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'Account does not have login credentials configured. Contact your administrator.',
      );
    }

    // 3. Verify Password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      this.recordFailedAttempt(lookupKey);
      await this.auditService.log({
        actorId: user.id,
        action: 'USER_LOGIN_FAILED',
        entityType: 'USER',
        entityId: user.id,
        ip,
        userAgent,
        after: { reason: 'Invalid password' },
      });
      throw new UnauthorizedException('Invalid login credentials.');
    }

    // Reset failed attempts on success
    this.failedLogins.delete(lookupKey);

    // 4. Generate Tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    // 5. Audit Log Success
    await this.auditService.log({
      actorId: user.id,
      action: 'USER_LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user.id,
      ip,
      userAgent,
      after: { role: user.role, zoneId: user.zoneId },
    });

    return {
      accessToken,
      refreshToken,
      user: this.mapUserProfile(user),
      dashboard: this.getDashboardRouting(user.role),
    };
  }

  /**
   * Rotates refresh token and issues a new access/refresh pair.
   */
  async refreshTokens(refreshToken: string, ip?: string, userAgent?: string): Promise<AuthResponseDto> {
    const refreshSecret = this.configService.get<string>(
      'jwt.refreshSecret',
      'aegis-dev-super-secure-refresh-token-secret-key-32-chars!',
    );

    let payload: { sub: string; jti: string; type: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Refresh token has expired or is invalid.');
    }

    if (payload.type !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Invalid token type.');
    }

    // Check if refresh token was revoked
    const stored = this.activeRefreshTokens.get(payload.jti);
    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh token revoked or already used.');
    }

    // Invalidate old refresh token (Token Rotation)
    this.activeRefreshTokens.delete(payload.jti);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { zone: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account no longer active.');
    }

    const tokens = await this.generateTokens(user);

    await this.auditService.log({
      actorId: user.id,
      action: 'TOKEN_REFRESH',
      entityType: 'USER',
      entityId: user.id,
      ip,
      userAgent,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.mapUserProfile(user),
      dashboard: this.getDashboardRouting(user.role),
    };
  }

  /**
   * Logs out user and revokes refresh token.
   */
  async logout(userId: string, refreshToken?: string, ip?: string, userAgent?: string): Promise<{ success: boolean }> {
    if (refreshToken) {
      try {
        const refreshSecret = this.configService.get<string>('jwt.refreshSecret');
        const payload = await this.jwtService.verifyAsync(refreshToken, { secret: refreshSecret });
        if (payload.jti) {
          this.activeRefreshTokens.delete(payload.jti);
        }
      } catch {
        // Token was invalid anyway
      }
    }

    await this.auditService.log({
      actorId: userId,
      action: 'USER_LOGOUT',
      entityType: 'USER',
      entityId: userId,
      ip,
      userAgent,
    });

    return { success: true };
  }

  /**
   * Returns current authenticated user profile & role routing.
   */
  async getMe(userId: string): Promise<{ user: UserProfileDto; dashboard: DashboardRoutingDto }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { zone: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated.');
    }

    return {
      user: this.mapUserProfile(user),
      dashboard: this.getDashboardRouting(user.role),
    };
  }

  /**
   * Internal helper to issue access and refresh tokens.
   */
  private async generateTokens(user: { id: string; name: string; phone: string; role: string; zoneId: string | null }) {
    const accessSecret = this.configService.get<string>(
      'jwt.accessSecret',
      'aegis-dev-super-secure-access-token-secret-key-32-chars!',
    );
    const refreshSecret = this.configService.get<string>(
      'jwt.refreshSecret',
      'aegis-dev-super-secure-refresh-token-secret-key-32-chars!',
    );
    const accessExpiresIn = this.configService.get<string>('jwt.accessExpiresIn', '15m');
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn', '7d');

    const jti = randomUUID();

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          zoneId: user.zoneId,
          type: 'access',
        },
        { secret: accessSecret, expiresIn: accessExpiresIn as any },
      ),
      this.jwtService.signAsync(
        {
          sub: user.id,
          jti,
          type: 'refresh',
        },
        { secret: refreshSecret, expiresIn: refreshExpiresIn as any },
      ),
    ]);

    // Store active refresh token
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    this.activeRefreshTokens.set(jti, {
      userId: user.id,
      expiresAt: Date.now() + sevenDaysMs,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Role-adaptive dashboard metadata mapper.
   */
  private getDashboardRouting(role: string): DashboardRoutingDto {
    switch (role) {
      case 'ADMIN':
        return {
          route: '/admin',
          roleTitle: 'System Administrator',
          allowedSections: [
            'governance',
            'incidents',
            'verify',
            'users',
            'zones',
            'audit',
            'system_health',
            'blast_override',
          ],
        };
      case 'SECURITY':
        return {
          route: '/dashboard',
          roleTitle: 'Security Operations Officer',
          allowedSections: [
            'incident_feed',
            'report_incident',
            'verify_modal',
            'dismiss_modal',
            'alert_monitor',
            'retry_failed',
            'community_directory',
          ],
        };
      case 'RESIDENT':
      default:
        return {
          route: '/portal',
          roleTitle: 'Community Resident',
          allowedSections: ['community_alerts', 'my_profile', 'notification_preferences', 'family_alerts'],
        };
    }
  }

  private mapUserProfile(user: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    houseNumber?: string | null;
    areaDescription?: string | null;
    role: string;
    preferredLanguage: string;
    zoneId: string | null;
    zone?: { name: string } | null;
    alertsEnabled: boolean;
  }): UserProfileDto {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email || null,
      houseNumber: user.houseNumber || null,
      areaDescription: user.areaDescription || null,
      role: user.role,
      preferredLanguage: user.preferredLanguage,
      zoneId: user.zoneId,
      zoneName: user.zone?.name || null,
      alertsEnabled: user.alertsEnabled,
    };
  }

  private checkBruteForceLockout(phone: string): void {
    const tracker = this.failedLogins.get(phone);
    if (!tracker) return;

    if (tracker.lockedUntil && tracker.lockedUntil > Date.now()) {
      const remainingSeconds = Math.ceil((tracker.lockedUntil - Date.now()) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Too many failed login attempts. Account temporarily locked. Try again in ${remainingSeconds} seconds.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailedAttempt(phone: string): void {
    const tracker = this.failedLogins.get(phone) || { count: 0 };
    tracker.count += 1;

    // Lock account for 15 minutes if 5 failed attempts reached
    if (tracker.count >= 5) {
      tracker.lockedUntil = Date.now() + 15 * 60 * 1000;
      this.logger.warn(`[BRUTE_FORCE] Account ${phone} temporarily locked for 15 minutes (5 failed attempts).`);
    }

    this.failedLogins.set(phone, tracker);
  }
}

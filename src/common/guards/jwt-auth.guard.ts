import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    
    // 1. Extract from HttpOnly cookie first (Modern web app / Next.js)
    let token: string | undefined = request.cookies?.accessToken;

    // 2. Fall back to Authorization: Bearer header (Mobile apps / CLI / Swagger)
    if (!token && request.headers.authorization) {
      const authHeader = request.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
    }

    if (!token) {
      throw new UnauthorizedException('Authentication required. Missing Bearer token or auth cookie.');
    }

    const secret = this.configService.get<string>(
      'jwt.accessSecret',
      'aegis-dev-super-secure-access-token-secret-key-32-chars!',
    );

    try {
      const payload = await this.jwtService.verifyAsync(token, { secret });

      if (payload.type && payload.type !== 'access') {
        throw new UnauthorizedException('Invalid token type. Access token required.');
      }

      // Attach user payload to request
      const user: AuthenticatedUser = {
        id: payload.sub,
        name: payload.name || 'User',
        phone: payload.phone || '',
        role: payload.role || 'RESIDENT',
        zoneId: payload.zoneId || null,
      };

      (request as Request & { user: AuthenticatedUser }).user = user;
      return true;
    } catch (error) {
      const msg = (error as Error).name === 'TokenExpiredError'
        ? 'Session has expired. Please log in again.'
        : 'Invalid or forged authentication token.';
      throw new UnauthorizedException(msg);
    }
  }
}

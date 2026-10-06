import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto, UserProfileDto, DashboardRoutingDto } from './dto/auth-response.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User Login',
    description:
      'Authenticates user with phone or email identifier and password. Returns tokens in JSON and automatically sets secure HttpOnly cookies for web browsers.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid login credentials' })
  @ApiResponse({ status: 429, description: 'Too many failed login attempts - account locked' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.login(dto, ip, userAgent);

    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate Refresh Token',
    description:
      'Rotates the refresh token (read from JSON body or HttpOnly cookie) and returns a new access + refresh token pair.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto, description: 'Tokens successfully refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshTokens(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const token = dto?.refreshToken || req.cookies?.refreshToken;
    if (!token) {
      throw new UnauthorizedException('Refresh token is required via request body or HttpOnly cookie.');
    }

    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.refreshTokens(token, ip, userAgent);

    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'User Logout',
    description: 'Revokes active refresh session and clears HttpOnly authentication cookies.',
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    const token = body?.refreshToken || req.cookies?.refreshToken;
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    this.clearAuthCookies(res);
    return this.authService.logout(user.id, token, ip, userAgent);
  }

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get Current Authenticated Profile',
    description: 'Returns profile details and role-based dashboard destination for the current bearer token or cookie.',
  })
  @ApiResponse({ status: 200, description: 'Current profile & dashboard routing' })
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<{ user: UserProfileDto; dashboard: DashboardRoutingDto }> {
    return this.authService.getMe(user.id);
  }

  /**
   * Sets secure HttpOnly cookies for web browsers (XSS protection).
   */
  private setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const fifteenMinutesMs = 15 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: fifteenMinutesMs,
      path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: sevenDaysMs,
      path: '/',
    });
  }

  /**
   * Clears authentication cookies on logout.
   */
  private clearAuthCookies(res: Response): void {
    const isProduction = process.env.NODE_ENV === 'production';

    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    });
  }
}

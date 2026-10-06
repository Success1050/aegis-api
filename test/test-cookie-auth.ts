import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { AuditService } from '../src/modules/audit/audit.service';

async function main() {
  console.log('🧪 Testing HttpOnly Cookie Authentication & JwtAuthGuard...\n');

  const prisma = new PrismaClient();
  const configService = new ConfigService();
  const jwtService = new JwtService({});
  const auditService = new AuditService(prisma as any);
  const authService = new AuthService(prisma as any, jwtService, configService, auditService);
  const authController = new AuthController(authService);
  const reflector = new Reflector();
  const jwtGuard = new JwtAuthGuard(reflector, jwtService, configService);

  // 1. Test Login with Mock Response Object
  console.log('--- 1. Testing AuthController.login() and Set-Cookie ---');
  const cookiesSet: Record<string, { value: string; options: any }> = {};
  const mockRes: any = {
    cookie: (name: string, value: string, options: any) => {
      cookiesSet[name] = { value, options };
    },
    clearCookie: (name: string, options: any) => {
      delete cookiesSet[name];
    },
  };

  const mockReq: any = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'Jest-Cookie-Test/1.0' },
  };

  // Login as Officer Garba (+2348020000001)
  const loginResult = await authController.login(
    {
      identifier: '+2348020000001',
      password: 'OfficerSecure2026!',
    },
    mockReq,
    mockRes,
  );

  console.log('Login Result User:', loginResult.user.name, `(${loginResult.user.role})`);
  console.log('AccessToken in JSON Body:', loginResult.accessToken ? 'Present' : 'Missing');
  console.log('RefreshToken in JSON Body:', loginResult.refreshToken ? 'Present' : 'Missing');

  // Verify HttpOnly cookies
  console.log('Cookies Set Count:', Object.keys(cookiesSet).length);
  const accessCookie = cookiesSet['accessToken'];
  const refreshCookie = cookiesSet['refreshToken'];

  if (!accessCookie || !refreshCookie) {
    throw new Error('Expected accessToken and refreshToken cookies to be set!');
  }

  console.log('AccessToken Cookie httpOnly:', accessCookie.options.httpOnly);
  console.log('AccessToken Cookie maxAge (ms):', accessCookie.options.maxAge);
  console.log('RefreshToken Cookie httpOnly:', refreshCookie.options.httpOnly);
  console.log('RefreshToken Cookie maxAge (ms):', refreshCookie.options.maxAge);

  if (!accessCookie.options.httpOnly || !refreshCookie.options.httpOnly) {
    throw new Error('Cookies must be httpOnly: true!');
  }
  console.log('✅ HttpOnly cookies set correctly on login!\n');

  // 2. Test JwtAuthGuard using ONLY HttpOnly Cookie (No Authorization Header)
  console.log('--- 2. Testing JwtAuthGuard with ONLY HttpOnly Cookie ---');
  const protectedReq: any = {
    cookies: {
      accessToken: accessCookie.value,
    },
    headers: {}, // Notice: No Authorization header!
  };

  const mockContext: any = {
    getHandler: () => () => {},
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => protectedReq,
    }),
  };

  const canActivate = await jwtGuard.canActivate(mockContext);
  console.log('Guard Activated via Cookie:', canActivate);
  console.log('Decoded req.user:', protectedReq.user);

  if (!canActivate || protectedReq.user?.phone !== '+2348020000001') {
    throw new Error('JwtAuthGuard failed to authenticate via HttpOnly cookie!');
  }
  console.log('✅ JwtAuthGuard successfully authenticated via cookie with zero headers!\n');

  // 3. Test Logout with Cookie Clearance
  console.log('--- 3. Testing AuthController.logout() and Cookie Clearance ---');
  let clearedCookies: string[] = [];
  const logoutRes: any = {
    clearCookie: (name: string) => {
      clearedCookies.push(name);
    },
  };

  await authController.logout(
    protectedReq.user,
    { refreshToken: refreshCookie.value },
    mockReq,
    logoutRes,
  );

  console.log('Cleared Cookies:', clearedCookies);
  if (!clearedCookies.includes('accessToken') || !clearedCookies.includes('refreshToken')) {
    throw new Error('Expected logout to clear both accessToken and refreshToken cookies!');
  }
  console.log('✅ Logout successfully cleared both HttpOnly authentication cookies!\n');

  await prisma.$disconnect();
  console.log('🎉 ALL HTTPONLY COOKIE AUTH TESTS PASSED PERFECTLY!');
}

main().catch((err) => {
  console.error('❌ Cookie test failed:', err);
  process.exit(1);
});

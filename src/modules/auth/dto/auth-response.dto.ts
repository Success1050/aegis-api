import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000001', description: 'User ID' })
  id: string;

  @ApiProperty({ example: 'Super Admin Emmanuel', description: 'User full name' })
  name: string;

  @ApiProperty({ example: '+2348000000001', description: 'E.164 phone number' })
  phone: string;

  @ApiProperty({ example: 'ADMIN', enum: ['ADMIN', 'SECURITY', 'RESIDENT'], description: 'User role' })
  role: string;

  @ApiProperty({ example: 'ENGLISH', description: 'Preferred language' })
  preferredLanguage: string;

  @ApiPropertyOptional({ example: 'a0000000-0000-0000-0000-000000000001', description: 'Assigned community zone ID' })
  zoneId?: string | null;

  @ApiPropertyOptional({ example: 'Community A (North Ward)', description: 'Community zone name' })
  zoneName?: string | null;

  @ApiPropertyOptional({ example: 'admin@aegis.ng', description: 'Registered email address' })
  email?: string | null;

  @ApiPropertyOptional({ example: 'House 14B', description: 'House or compound number' })
  houseNumber?: string | null;

  @ApiPropertyOptional({ example: 'Angwan Rimi Close', description: 'Area description or street landmark' })
  areaDescription?: string | null;

  @ApiProperty({ example: true, description: 'Whether alerts are enabled' })
  alertsEnabled: boolean;
}

export class DashboardRoutingDto {
  @ApiProperty({ example: '/admin', description: 'Destination route for user role dashboard' })
  route: string;

  @ApiProperty({ example: 'System Administrator', description: 'Human-readable role title' })
  roleTitle: string;

  @ApiProperty({
    example: ['incidents', 'verify', 'users', 'zones', 'audit'],
    description: 'Permitted application functional sections',
  })
  allowedSections: string[];
}

export class AuthResponseDto {
  @ApiProperty({ description: 'Short-lived JWT access token (15m)' })
  accessToken: string;

  @ApiProperty({ description: 'Rotating JWT refresh token (7d)' })
  refreshToken: string;

  @ApiProperty({ type: UserProfileDto, description: 'Authenticated user profile' })
  user: UserProfileDto;

  @ApiProperty({ type: DashboardRoutingDto, description: 'Role-based dashboard destination' })
  dashboard: DashboardRoutingDto;
}

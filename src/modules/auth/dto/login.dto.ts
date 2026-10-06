import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    example: '+2348000000001',
    description: 'Login identifier: Nigerian phone number (+234... / 080...) OR registered email address',
  })
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiPropertyOptional({
    example: '+2348000000001',
    description: 'Nigerian phone number in E.164 (+234...) or local format (080...)',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'admin@aegis.ng',
    description: 'Registered account email address',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    example: 'AdminSecure2026!',
    description: 'User account password',
  })
  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Role, Language } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'Ibrahim Danladi', description: 'User full name' })
  @IsNotEmpty({ message: 'Name is required' })
  @IsString()
  name: string;

  @ApiProperty({
    example: '+2348031234567',
    description: 'Nigerian phone number (e.g., +234..., 080...)',
  })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  phone: string;

  @ApiPropertyOptional({
    example: 'ibrahim.danladi@aegis.ng',
    description: 'Email address for login & credentials dispatch',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Must be a valid email address' })
  email?: string;

  @ApiPropertyOptional({
    enum: Role,
    default: Role.RESIDENT,
    description: 'User access role: RESIDENT, SECURITY, or ADMIN',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    enum: Language,
    default: Language.ENGLISH,
    description: 'Preferred alert language: ENGLISH, HAUSA, IGBO, YORUBA, PIDGIN',
  })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;

  @ApiPropertyOptional({
    example: 'a0000000-0000-0000-0000-000000000001',
    description: 'Home community zone ID (Zone-based membership)',
  })
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @ApiPropertyOptional({
    example: 'Plot 14B',
    description: 'House or compound number identifier',
  })
  @IsOptional()
  @IsString()
  houseNumber?: string;

  @ApiPropertyOptional({
    example: 'Angwan Rimi Close, Near Central Mosque',
    description: 'Area description, street name, or local landmark',
  })
  @IsOptional()
  @IsString()
  areaDescription?: string;

  @ApiPropertyOptional({
    example: 9.8965,
    description: 'GPS latitude coordinate (GPS-enhanced mode)',
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    example: 8.8583,
    description: 'GPS longitude coordinate (GPS-enhanced mode)',
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Whether emergency alert notifications are active (defaults to true)',
  })
  @IsOptional()
  @IsBoolean()
  alertsEnabled?: boolean;

  @ApiPropertyOptional({
    example: 'SecurePass2026!',
    description: 'Custom password. If omitted, a secure random password will be auto-generated and emailed',
  })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password?: string;
}

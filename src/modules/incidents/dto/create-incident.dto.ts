import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
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
import { IncidentType, Severity } from '@prisma/client';

export class CreateIncidentDto {
  @ApiProperty({
    enum: IncidentType,
    example: IncidentType.POSSIBLE_INTRUSION,
    description: 'Type of security or emergency incident',
  })
  @IsNotEmpty({ message: 'Incident type is required' })
  @IsEnum(IncidentType)
  type: IncidentType;

  @ApiProperty({
    enum: Severity,
    example: Severity.HIGH,
    description: 'Severity level: LOW, MEDIUM, HIGH, CRITICAL',
  })
  @IsNotEmpty({ message: 'Severity is required' })
  @IsEnum(Severity)
  severity: Severity;

  @ApiProperty({
    example: 'Multiple individuals spotted attempting to breach northern community perimeter gate.',
    description: 'Detailed description of the incident',
  })
  @IsNotEmpty({ message: 'Description is required' })
  @IsString()
  @MinLength(10, { message: 'Description must be at least 10 characters' })
  description: string;

  @ApiPropertyOptional({
    example: 9.898,
    description: 'Incident latitude coordinate (derived from zone if omitted)',
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    example: 8.857,
    description: 'Incident longitude coordinate (derived from zone if omitted)',
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    example: 'a0000000-0000-0000-0000-000000000001',
    description: 'Associated community zone ID',
  })
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @ApiPropertyOptional({
    example: 2000,
    description: 'Alert blast radius in meters (snapshotted at creation; default: 2000m)',
  })
  @IsOptional()
  @IsNumber()
  @Min(100, { message: 'Alert radius must be at least 100 meters' })
  @Max(25000, { message: 'Alert radius cannot exceed 25,000 meters' })
  alertRadiusMeters?: number;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Explicit acknowledgment if a duplicate incident was detected within 500m in the last 30m',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeDuplicates?: boolean;
}

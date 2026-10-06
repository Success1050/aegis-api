import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentType, Language } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PreviewTemplateDto {
  @ApiProperty({
    description: 'Alert template type',
    enum: ['ALERT_VERIFIED_INCIDENT', 'ALL_CLEAR'],
    example: 'ALERT_VERIFIED_INCIDENT',
  })
  @IsEnum(['ALERT_VERIFIED_INCIDENT', 'ALL_CLEAR'])
  templateType: 'ALERT_VERIFIED_INCIDENT' | 'ALL_CLEAR';

  @ApiProperty({
    description: 'Target language for localization',
    enum: Language,
    example: Language.HAUSA,
  })
  @IsEnum(Language)
  language: Language;

  @ApiProperty({
    description: 'Human-readable incident sequence identifier',
    example: 'INC-000001',
  })
  @IsString()
  @IsNotEmpty()
  incidentNumber: string;

  @ApiProperty({
    description: 'Type of emergency incident',
    enum: IncidentType,
    example: IncidentType.POSSIBLE_INTRUSION,
  })
  @IsEnum(IncidentType)
  incidentType: IncidentType;

  @ApiProperty({
    description: 'Human-readable community landmark or zone name (no raw GPS coordinates allowed)',
    example: 'Maitama Zone A',
  })
  @IsString()
  @IsNotEmpty()
  areaName: string;

  @ApiPropertyOptional({
    description: 'Permit rendering templates pending native linguistic review',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowUnreviewed?: boolean;

  @ApiPropertyOptional({
    description: 'Preserve Hausa hooked letters (UCS-2) or transliterate to ASCII (GSM-7)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  preserveDiacritics?: boolean;
}

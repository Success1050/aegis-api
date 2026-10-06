import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentSource, IncidentStatus, IncidentType, Severity } from '@prisma/client';

export class IncidentAlertStatsDto {
  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 40 })
  sent: number;

  @ApiProperty({ example: 38 })
  delivered: number;

  @ApiProperty({ example: 2 })
  failed: number;
}

export class IncidentResponseDto {
  @ApiProperty({ example: 'b0000000-0000-0000-0000-000000000001' })
  id: string;

  @ApiProperty({ example: 'INC-000001' })
  number: string;

  @ApiProperty({ enum: IncidentType, example: IncidentType.POSSIBLE_INTRUSION })
  type: IncidentType;

  @ApiProperty({ enum: IncidentSource, example: IncidentSource.MANUAL })
  source: IncidentSource;

  @ApiProperty({ example: 9.898 })
  latitude: number;

  @ApiProperty({ example: 8.857 })
  longitude: number;

  @ApiPropertyOptional({ example: 'a0000000-0000-0000-0000-000000000001' })
  zoneId?: string | null;

  @ApiPropertyOptional({ example: 'Community A (North Ward)' })
  zoneName?: string | null;

  @ApiProperty({ example: 'Perimeter movement reported near northern gate.' })
  description: string;

  @ApiProperty({ enum: Severity, example: Severity.HIGH })
  severity: Severity;

  @ApiProperty({ enum: IncidentStatus, example: IncidentStatus.PENDING_REVIEW })
  status: IncidentStatus;

  @ApiProperty({ example: 2000 })
  alertRadiusMeters: number;

  @ApiProperty({ example: 'u0000000-0000-0000-0000-000000000001' })
  reportedById: string;

  @ApiPropertyOptional({ example: 'Officer Abubakar Garba' })
  reportedByName?: string;

  @ApiPropertyOptional({ example: 'u0000000-0000-0000-0000-000000000002' })
  verifiedById?: string | null;

  @ApiPropertyOptional({ example: 'Officer Bello Musa' })
  verifiedByName?: string | null;

  @ApiPropertyOptional({ example: null })
  dismissedById?: string | null;

  @ApiPropertyOptional({ example: null })
  dismissedByName?: string | null;

  @ApiPropertyOptional({ example: null })
  dismissReason?: string | null;

  @ApiPropertyOptional({ example: null })
  verifiedAt?: Date | null;

  @ApiPropertyOptional({ example: null })
  dismissedAt?: Date | null;

  @ApiPropertyOptional({ example: null })
  alertsCompletedAt?: Date | null;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiPropertyOptional({ type: IncidentAlertStatsDto })
  alertStats?: IncidentAlertStatsDto;

  @ApiProperty({ example: '2026-10-06T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-06T12:00:00.000Z' })
  updatedAt: Date;
}

export class PaginatedIncidentResponseDto {
  @ApiProperty({ type: [IncidentResponseDto] })
  data: IncidentResponseDto[];

  @ApiProperty({
    example: { total: 15, page: 1, limit: 20, totalPages: 1 },
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

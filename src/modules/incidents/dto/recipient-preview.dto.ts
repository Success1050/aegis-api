import { ApiProperty } from '@nestjs/swagger';

export class RecipientPreviewSampleDto {
  @ApiProperty({ example: 'John Danladi' })
  name: string;

  @ApiProperty({ example: '+234803•••0001' })
  phoneMasked: string;

  @ApiProperty({ example: 'RESIDENT' })
  role: string;

  @ApiProperty({ example: 'HAUSA' })
  preferredLanguage: string;

  @ApiProperty({ example: 'BOTH', enum: ['PHYSICAL_RADIUS', 'ZONE_MEMBERSHIP', 'BOTH'] })
  matchReason: string;

  @ApiProperty({ example: 397, nullable: true })
  distanceMeters: number | null;
}

export class RecipientPreviewBreakdownDto {
  @ApiProperty({ example: 39 })
  byPhysicalRadius: number;

  @ApiProperty({ example: 3 })
  byZoneMembership: number;

  @ApiProperty({ example: 39 })
  overlapCount: number;

  @ApiProperty({ example: { HAUSA: 12, YORUBA: 9, IGBO: 8, PIDGIN: 8, ENGLISH: 5 } })
  byLanguage: Record<string, number>;

  @ApiProperty({ example: { RESIDENT: 39, SECURITY: 2, ADMIN: 1 } })
  byRole: Record<string, number>;
}

export class RecipientPreviewResponseDto {
  @ApiProperty({ example: 'INC-000001' })
  incidentNumber: string;

  @ApiProperty({ example: 2000 })
  alertRadiusMeters: number;

  @ApiProperty({ example: 42 })
  totalRecipients: number;

  @ApiProperty({ type: RecipientPreviewBreakdownDto })
  breakdown: RecipientPreviewBreakdownDto;

  @ApiProperty({ example: 4 })
  staleLocationCount: number;

  @ApiProperty({ example: false })
  requiresLargeBlastConfirmation: boolean;

  @ApiProperty({ type: [RecipientPreviewSampleDto] })
  sampleRecipients: RecipientPreviewSampleDto[];
}

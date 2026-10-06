import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, Language } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000001' })
  id: string;

  @ApiProperty({ example: 'John Danladi' })
  name: string;

  @ApiProperty({ example: '+2348030000001' })
  phone: string;

  @ApiPropertyOptional({ example: 'john.danladi@aegis.ng' })
  email?: string | null;

  @ApiProperty({ enum: Role, example: Role.RESIDENT })
  role: Role;

  @ApiProperty({ enum: Language, example: Language.HAUSA })
  preferredLanguage: Language;

  @ApiPropertyOptional({ example: 'a0000000-0000-0000-0000-000000000001' })
  zoneId?: string | null;

  @ApiPropertyOptional({ example: 'Community A (North Ward)' })
  zoneName?: string | null;

  @ApiPropertyOptional({ example: 'Plot 14B' })
  houseNumber?: string | null;

  @ApiPropertyOptional({ example: 'Angwan Rimi Close' })
  areaDescription?: string | null;

  @ApiPropertyOptional({ example: 9.8965 })
  latitude?: number | null;

  @ApiPropertyOptional({ example: 8.8583 })
  longitude?: number | null;

  @ApiPropertyOptional({ example: '2026-10-06T12:00:00.000Z' })
  locationUpdatedAt?: Date | null;

  @ApiProperty({ example: true })
  alertsEnabled: boolean;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-10-06T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-06T12:00:00.000Z' })
  updatedAt: Date;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 45 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class PaginatedUserResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  data: UserResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

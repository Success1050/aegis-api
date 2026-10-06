import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ZoneResponseDto {
  @ApiProperty({ example: 'a0000000-0000-0000-0000-000000000001' })
  id: string;

  @ApiProperty({ example: 'Community A (North Ward)' })
  name: string;

  @ApiProperty({ example: 9.898 })
  centerLat: number;

  @ApiProperty({ example: 8.857 })
  centerLng: number;

  @ApiProperty({ example: 2000 })
  radiusMeters: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiPropertyOptional({ example: 45, description: 'Number of registered community residents' })
  memberCount?: number;

  @ApiProperty({ example: '2026-10-06T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-06T12:00:00.000Z' })
  updatedAt: Date;
}

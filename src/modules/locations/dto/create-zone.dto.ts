import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateZoneDto {
  @ApiProperty({ example: 'Community A (North Ward)', description: 'Community zone name' })
  @IsNotEmpty({ message: 'Zone name is required' })
  @IsString()
  name: string;

  @ApiProperty({ example: 9.898, description: 'Center latitude coordinate' })
  @IsNotEmpty({ message: 'Center latitude is required' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  centerLat: number;

  @ApiProperty({ example: 8.857, description: 'Center longitude coordinate' })
  @IsNotEmpty({ message: 'Center longitude is required' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  centerLng: number;

  @ApiPropertyOptional({ example: 2000, description: 'Default radius in meters (default 2000m)' })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(50000)
  radiusMeters?: number;

  @ApiPropertyOptional({ example: true, description: 'Whether the zone is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

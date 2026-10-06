import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveIncidentDto {
  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Whether to dispatch an ALL_CLEAR notification broadcast to previous alert recipients',
  })
  @IsOptional()
  @IsBoolean()
  sendAllClear?: boolean;

  @ApiPropertyOptional({
    example: 'Perimeter secured by community joint patrol team. Danger has passed.',
    description: 'Resolution summary notes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

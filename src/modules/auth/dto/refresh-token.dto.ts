import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description: 'Rotating refresh token (can also be provided automatically via HttpOnly cookie)',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class VerifyIncidentDto {
  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Explicit confirmation if eligible blast count exceeds safety limit (MAX_RECIPIENTS_PER_INCIDENT)',
  })
  @IsOptional()
  @IsBoolean()
  confirmLargeBlast?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Administrator override to bypass Four-Eyes principle if operating with a single officer',
  })
  @IsOptional()
  @IsBoolean()
  overrideSelfVerify?: boolean;
}

import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({
    example: true,
    description: 'Active status for soft deactivation / reactivation',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

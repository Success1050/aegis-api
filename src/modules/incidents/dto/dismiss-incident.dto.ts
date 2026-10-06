import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class DismissIncidentDto {
  @ApiProperty({
    example: 'False alarm. Community patrol verified normal activity with no perimeter threat.',
    description: 'Mandatory reason for dismissal (min 5, max 500 characters)',
  })
  @IsNotEmpty({ message: 'Dismissal reason is required' })
  @IsString()
  @MinLength(5, { message: 'Dismissal reason must be at least 5 characters' })
  @MaxLength(500, { message: 'Dismissal reason cannot exceed 500 characters' })
  reason: string;
}

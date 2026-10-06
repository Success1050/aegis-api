import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400, description: 'HTTP Status Code' })
  statusCode: number;

  @ApiProperty({ example: 'Bad Request', description: 'HTTP Error Category' })
  error: string;

  @ApiProperty({ example: 'Validation failed', description: 'Descriptive human-readable error message' })
  message: string;

  @ApiPropertyOptional({ example: ['phone must be a valid phone number'], description: 'Optional detailed validation or error items' })
  details?: unknown;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Unique request correlation ID' })
  requestId: string;

  @ApiProperty({ example: '2026-10-05T22:30:00.000Z', description: 'UTC timestamp of the error occurrence' })
  timestamp: string;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 100, description: 'Total number of items matching filter' })
  total: number;

  @ApiProperty({ example: 20, description: 'Items per page limit' })
  limit: number;

  @ApiPropertyOptional({ example: 'inc_xyz123', description: 'Cursor pointing to next page' })
  nextCursor?: string;

  @ApiProperty({ example: false, description: 'Indicates whether another page is available' })
  hasNextPage: boolean;
}

export class PaginatedResponseDto<T> {
  data: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

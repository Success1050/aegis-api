import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SmsDeliveryWebhookDto {
  @ApiProperty({
    description: 'Unique provider message identifier returned during dispatch',
    example: 'fake-msg-8f12a4c9',
  })
  @IsString()
  @IsNotEmpty()
  message_id: string;

  @ApiProperty({
    description: 'Delivery status reported by telecom carrier or gateway',
    example: 'DELIVERED',
    enum: ['DELIVERED', 'FAILED', 'UNDELIVERED', 'REJECTED', 'SENT'],
  })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiPropertyOptional({
    description: 'Destination phone number snapshot in E.164 format',
    example: '+2348012345678',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Failure or rejection reason if message could not be delivered',
    example: 'Carrier DND active on subscriber number',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when delivery was confirmed by carrier',
    example: '2026-10-06T14:35:10Z',
  })
  @IsOptional()
  @IsString()
  delivered_at?: string;
}

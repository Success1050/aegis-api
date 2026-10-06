import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common';
import { NotificationsService } from './notifications.service';
import { SmsDeliveryWebhookDto } from './dto/sms-delivery-webhook.dto';

@ApiTags('Webhooks')
@Controller('webhooks')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Public()
  @Post('sms-delivery')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive SMS delivery receipt from telecom gateway / aggregator (Termii, Fake)',
    description:
      'Processes asynchronous delivery status updates (DELIVERED / FAILED) with HMAC-SHA256 signature verification and replay protection.',
  })
  @ApiHeader({
    name: 'x-signature',
    description: 'HMAC-SHA256 hex signature of request payload',
    required: false,
  })
  @ApiHeader({
    name: 'x-timestamp',
    description: 'Epoch millisecond timestamp of webhook dispatch for replay protection',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery receipt processed idempotently',
  })
  async handleSmsDeliveryWebhook(
    @Body() dto: SmsDeliveryWebhookDto,
    @Headers('x-signature') sig1?: string,
    @Headers('x-termii-signature') sig2?: string,
    @Headers('x-aegis-signature') sig3?: string,
    @Headers('x-timestamp') timestamp?: string,
    @Req() req?: Request,
  ): Promise<{ success: boolean; alertId?: string; status?: string; duplicate?: boolean }> {
    const signature = sig1 || sig2 || sig3;
    const rawBody = (req as any)?.rawBody ? (req as any).rawBody.toString('utf8') : undefined;

    return this.notificationsService.processDeliveryWebhook(
      dto,
      signature,
      timestamp,
      rawBody,
    );
  }
}

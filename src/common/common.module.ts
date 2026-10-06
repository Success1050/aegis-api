import { Global, Module } from '@nestjs/common';
import { MailService } from './services/mail.service';
import { IdempotencyService } from './services/idempotency.service';

@Global()
@Module({
  providers: [MailService, IdempotencyService],
  exports: [MailService, IdempotencyService],
})
export class CommonModule {}

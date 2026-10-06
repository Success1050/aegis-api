import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import {
  SMS_PROVIDER_TOKEN,
  FakeSmsProvider,
  TermiiSmsProvider,
} from './providers';

@Module({
  controllers: [NotificationsController],
  providers: [
    FakeSmsProvider,
    TermiiSmsProvider,
    {
      provide: SMS_PROVIDER_TOKEN,
      useFactory: (
        configService: ConfigService,
        fakeProvider: FakeSmsProvider,
        termiiProvider: TermiiSmsProvider,
      ) => {
        const providerName =
          configService.get<string>('sms.provider') ||
          process.env.SMS_PROVIDER ||
          'fake';
        if (providerName.toLowerCase() === 'termii' || providerName.toLowerCase() === 'real') {
          return termiiProvider;
        }
        return fakeProvider;
      },
      inject: [ConfigService, FakeSmsProvider, TermiiSmsProvider],
    },
    NotificationsService,
  ],
  exports: [NotificationsService, SMS_PROVIDER_TOKEN, FakeSmsProvider, TermiiSmsProvider],
})
export class NotificationsModule {}

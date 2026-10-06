import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SmsProvider, SendSmsInput, SmsSendResult } from './sms-provider.interface';
import { calculateSmsSegments, maskPhone } from '../../../common';

@Injectable()
export class TermiiSmsProvider implements SmsProvider {
  readonly name = 'termii';
  private readonly logger = new Logger(TermiiSmsProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async send(input: SendSmsInput): Promise<SmsSendResult> {
    const apiKey =
      this.configService.get<string>('TERMII_API_KEY') ||
      process.env.TERMII_API_KEY ||
      '';
    const baseUrl =
      this.configService.get<string>('TERMII_BASE_URL') ||
      process.env.TERMII_BASE_URL ||
      'https://api.ng.termii.com';
    const senderId =
      this.configService.get<string>('sms.senderId') ||
      process.env.SMS_SENDER_ID ||
      'AEGIS';

    const analysis = calculateSmsSegments(input.message);
    const now = new Date();

    if (!apiKey) {
      this.logger.error(
        `[TermiiSMS] Cannot send SMS to ${maskPhone(input.to)}: TERMII_API_KEY is not configured.`,
      );
      return {
        success: false,
        provider: this.name,
        status: 'FAILED',
        error: 'MISSING_API_KEY: TERMII_API_KEY is not configured.',
        encoding: analysis.encoding,
        segmentCount: analysis.segmentCount,
        characterCount: analysis.characterCount,
        dispatchedAt: now,
      };
    }

    // Termii requires phone format without leading plus e.g. "2348012345678"
    const formattedTo = input.to.startsWith('+') ? input.to.substring(1) : input.to;

    try {
      const response = await axios.post(
        `${baseUrl}/api/sms/send`,
        {
          to: formattedTo,
          from: senderId,
          sms: input.message,
          type: 'plain',
          channel: 'generic',
          api_key: apiKey,
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      const data = response.data;
      const providerMessageId = data?.message_id || data?.id;

      this.logger.log(
        `[TermiiSMS] Alert sent successfully to ${maskPhone(input.to)}. ProviderMsgId: ${providerMessageId}`,
      );

      return {
        success: true,
        provider: this.name,
        providerMessageId: String(providerMessageId || ''),
        status: 'SENT',
        encoding: analysis.encoding,
        segmentCount: analysis.segmentCount,
        characterCount: analysis.characterCount,
        costUnits: analysis.segmentCount,
        dispatchedAt: now,
      };
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Unknown Termii API error';

      this.logger.error(
        `[TermiiSMS] Failed dispatching SMS to ${maskPhone(input.to)}: ${errorMsg}`,
      );

      return {
        success: false,
        provider: this.name,
        status: 'FAILED',
        error: `TERMII_API_ERROR: ${errorMsg}`,
        encoding: analysis.encoding,
        segmentCount: analysis.segmentCount,
        characterCount: analysis.characterCount,
        dispatchedAt: now,
      };
    }
  }
}

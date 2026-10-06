import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { SmsProvider, SendSmsInput, SmsSendResult } from './sms-provider.interface';
import { calculateSmsSegments, maskPhone } from '../../../common';

export interface FakeSmsRecord {
  input: SendSmsInput;
  result: SmsSendResult;
}

@Injectable()
export class FakeSmsProvider implements SmsProvider {
  readonly name = 'fake';
  private readonly logger = new Logger(FakeSmsProvider.name);
  private sentHistory: FakeSmsRecord[] = [];

  constructor(private readonly configService: ConfigService) {}

  async send(input: SendSmsInput): Promise<SmsSendResult> {
    const fakeLatencyMs =
      this.configService.get<number>('sms.fakeLatencyMs') ??
      parseInt(process.env.FAKE_SMS_LATENCY_MS || '50', 10);
    const fakeFailRate =
      this.configService.get<number>('sms.fakeFailRate') ??
      parseFloat(process.env.FAKE_SMS_FAIL_RATE || '0');

    // Simulate network latency
    if (fakeLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, fakeLatencyMs));
    }

    const analysis = calculateSmsSegments(input.message);
    const now = new Date();

    // Simulate failure rate
    if (fakeFailRate > 0 && Math.random() < fakeFailRate) {
      const errorResult: SmsSendResult = {
        success: false,
        provider: this.name,
        status: 'FAILED',
        error: 'SIMULATED_PROVIDER_FAILURE (FakeSmsProvider)',
        encoding: analysis.encoding,
        segmentCount: analysis.segmentCount,
        characterCount: analysis.characterCount,
        dispatchedAt: now,
      };

      this.sentHistory.push({ input, result: errorResult });
      this.logger.warn(
        `[FakeSMS] Simulated failure sending to ${maskPhone(input.to)}: ${errorResult.error}`,
      );
      return errorResult;
    }

    const providerMessageId = `fake-msg-${randomUUID().substring(0, 8)}`;
    const costUnits = analysis.segmentCount;

    const result: SmsSendResult = {
      success: true,
      provider: this.name,
      providerMessageId,
      status: 'SENT',
      encoding: analysis.encoding,
      segmentCount: analysis.segmentCount,
      characterCount: analysis.characterCount,
      costUnits,
      dispatchedAt: now,
    };

    this.sentHistory.push({ input, result });
    this.printAsciiBox(input, result);

    return result;
  }

  private printAsciiBox(input: SendSmsInput, result: SmsSendResult): void {
    const divider = '─'.repeat(66);
    const masked = maskPhone(input.to);
    const preview = input.message.length > 55 ? `${input.message.slice(0, 52)}...` : input.message;

    // ASCII terminal output
    // eslint-disable-next-line no-console
    console.log(`
┌─ [AEGIS SMS GATEWAY - FAKE DISPATCH] ${divider.slice(37)}┐
│ To:        ${masked.padEnd(58)}│
│ Msg ID:    ${(result.providerMessageId || 'N/A').padEnd(58)}│
│ Encoding:  ${`${result.encoding} (${result.characterCount} chars, ${result.segmentCount} seg)`.padEnd(58)}│
│ Content:   ${preview.padEnd(58)}│
└${divider}┘`);
  }

  getHistory(): FakeSmsRecord[] {
    return [...this.sentHistory];
  }

  clearHistory(): void {
    this.sentHistory = [];
  }

  findSentByPhone(phone: string): FakeSmsRecord[] {
    return this.sentHistory.filter((r) => r.input.to === phone);
  }

  findSentByAlertId(alertId: string): FakeSmsRecord | undefined {
    return this.sentHistory.find((r) => r.input.alertId === alertId);
  }
}

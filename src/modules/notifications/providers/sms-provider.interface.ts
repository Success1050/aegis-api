import { Language } from '@prisma/client';
import { SmsEncoding } from '../../../common';

export interface SendSmsInput {
  to: string; // E.164 phone number
  message: string;
  alertId?: string;
  incidentId?: string;
  language?: Language;
  priority?: 'HIGH' | 'NORMAL';
}

export interface SmsSendResult {
  success: boolean;
  provider: string;
  providerMessageId?: string;
  status: 'SENT' | 'FAILED' | 'REJECTED';
  error?: string;
  encoding: SmsEncoding;
  segmentCount: number;
  characterCount: number;
  costUnits?: number;
  dispatchedAt: Date;
}

export interface SmsProvider {
  readonly name: string;
  send(input: SendSmsInput): Promise<SmsSendResult>;
}

export const SMS_PROVIDER_TOKEN = 'SMS_PROVIDER';

import { Language, IncidentType } from '@prisma/client';
import { SmsSegmentAnalysis } from '../../../common';

export type TemplateReviewStatus = 'APPROVED' | 'NEEDS_NATIVE_REVIEW';

export type TemplateType = 'ALERT_VERIFIED_INCIDENT' | 'ALL_CLEAR';

export interface AlertTemplateDefinition {
  type: TemplateType;
  language: Language;
  template: string;
  reviewStatus: TemplateReviewStatus;
  reviewerNotes?: string;
}

export interface RenderAlertTemplateParams {
  templateType: TemplateType;
  language: Language;
  incidentNumber: string;
  incidentType: IncidentType;
  areaName: string;
  time?: string; // e.g. "14:35" or defaults to current time WAT
  allowUnreviewed?: boolean;
  preserveDiacritics?: boolean;
}

export interface RenderedAlertResult {
  text: string;
  usedLanguage: Language;
  reviewStatus: TemplateReviewStatus;
  fallbackOccurred: boolean;
  analysis: SmsSegmentAnalysis;
}

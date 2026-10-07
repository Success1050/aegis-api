import { Language } from '@prisma/client';
import { ALERT_TEMPLATES, INCIDENT_TYPE_TRANSLATIONS } from './alert-templates';
import {
  RenderAlertTemplateParams,
  RenderedAlertResult,
  TemplateReviewStatus,
} from './template.types';
import { calculateSmsSegments, normalizeForSms } from '../../../common/utils/sms-encoding.util';

/**
 * Checks if a string contains numeric coordinates (e.g. "9.0765, 7.3985")
 * to prevent leaking exact GPS coordinates to residents.
 */
export function containsCoordinates(text: string): boolean {
  // Matches coordinate patterns like "9.0765, 7.3985" or "lat 9.07, lng 7.39"
  const coordRegex = /[-+]?\d{1,2}\.\d{3,}\s*[,;\s]\s*[-+]?\d{1,3}\.\d{3,}/i;
  const keywordCoordRegex = /\b(lat|latitude|lng|longitude|gps|coords?)\b\s*[:=]?\s*[-+]?\d/i;
  return coordRegex.test(text) || keywordCoordRegex.test(text);
}

/**
 * Sanitizes an area name to ensure no GPS coordinates are leaked.
 */
export function sanitizeAreaName(areaName: string): string {
  if (!areaName || !areaName.trim()) {
    return 'your community';
  }

  const clean = areaName.trim();
  if (containsCoordinates(clean)) {
    throw new Error(
      `Security violation: Area name "${clean}" contains raw geographic coordinates. Alerts must only use human-readable landmark or zone names.`,
    );
  }

  return clean;
}

/**
 * Renders an alert SMS according to language preference, review status policies,
 * coordinate leakage protections, and SMS character encoding rules.
 */
export function renderAlertTemplate(params: RenderAlertTemplateParams): RenderedAlertResult {
  const {
    templateType,
    language,
    incidentNumber,
    incidentType,
    areaName,
    time,
    allowUnreviewed = false,
    preserveDiacritics = false,
  } = params;

  if (!incidentNumber || !incidentNumber.trim()) {
    throw new Error('Template rendering failed: incidentNumber is required.');
  }

  const safeAreaName = sanitizeAreaName(areaName);

  // 1. Language Resolution and Fallback Logic
  let targetLang = language;
  let fallbackOccurred = false;

  let templateDef = ALERT_TEMPLATES[templateType]?.[targetLang];

  if (!templateDef || (!allowUnreviewed && templateDef.reviewStatus === 'NEEDS_NATIVE_REVIEW')) {
    // Fall back to English
    targetLang = Language.ENGLISH;
    templateDef = ALERT_TEMPLATES[templateType][Language.ENGLISH];
    fallbackOccurred = targetLang !== language;
  }

  const reviewStatus: TemplateReviewStatus = templateDef.reviewStatus;

  // 2. Localized Incident Type
  const localizedType =
    INCIDENT_TYPE_TRANSLATIONS[incidentType]?.[targetLang] ||
    INCIDENT_TYPE_TRANSLATIONS[incidentType]?.[Language.ENGLISH] ||
    incidentType.replace(/_/g, ' ').toLowerCase();

  // 3. Time formatting (default to current WAT time HH:mm)
  let formattedTime = time;
  if (!formattedTime) {
    const now = new Date();
    // Nigeria is UTC+1 (WAT)
    const watHours = (now.getUTCHours() + 1) % 24;
    const watMinutes = now.getUTCMinutes();
    formattedTime = `${watHours.toString().padStart(2, '0')}:${watMinutes.toString().padStart(2, '0')}`;
  }

  // 4. Placeholder Replacement
  const rawRendered = templateDef.template
    .replace('{incidentNumber}', incidentNumber.trim())
    .replace('{type}', localizedType)
    .replace('{areaName}', safeAreaName)
    .replace('{time}', formattedTime);

  // 5. Fail Loudly on Unreplaced Placeholders
  const remainingPlaceholderMatch = rawRendered.match(/\{[a-zA-Z0-9_]+\}/g);
  if (remainingPlaceholderMatch) {
    throw new Error(
      `Template rendering failed: Unreplaced placeholder(s) detected: ${remainingPlaceholderMatch.join(
        ', ',
      )}`,
    );
  }

  // 6. Coordinate Leakage Double-Check
  if (containsCoordinates(rawRendered)) {
    throw new Error(
      'Security violation: Final rendered message contains raw GPS coordinate patterns.',
    );
  }

  // 7. SMS Normalization & Encoding Analysis
  const normalizedText = normalizeForSms(rawRendered, preserveDiacritics);
  const analysis = calculateSmsSegments(normalizedText);

  return {
    text: normalizedText,
    usedLanguage: targetLang,
    reviewStatus,
    fallbackOccurred,
    analysis,
  };
}

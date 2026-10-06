import { PrismaClient, IncidentStatus, Severity, IncidentType, Language, AlertStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  detectSmsEncoding,
  calculateSmsSegments,
  normalizeForSms,
} from '../src/common/utils/sms-encoding.util';
import {
  renderAlertTemplate,
  containsCoordinates,
  sanitizeAreaName,
} from '../src/modules/alerts/templates';
import { FakeSmsProvider } from '../src/modules/notifications/providers/fake-sms.provider';
import { TermiiSmsProvider } from '../src/modules/notifications/providers/termii-sms.provider';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { AuditService } from '../src/modules/audit/audit.service';

async function main() {
  console.log('🧪 Starting Day 6 SMS Service, Multilingual Templates & Webhook Test Suite...\n');

  const prisma = new PrismaClient();
  const config = new ConfigService();
  const auditService = new AuditService(prisma as any);
  const fakeSmsProvider = new FakeSmsProvider(config);
  const termiiSmsProvider = new TermiiSmsProvider(config);
  const notificationsService = new NotificationsService(
    fakeSmsProvider,
    prisma as any,
    auditService,
    config,
  );

  // =========================================================================
  // Part 1: SMS Character Encoding & Segment Analysis
  // =========================================================================
  console.log('--- Part 1: SMS Character Encoding & Segment Analysis ---');

  // 1.1 Pure GSM-7 standard characters
  const gsm7Text = 'AEGIS ALERT: Emergency incident reported in Maitama Zone A. Stay safe.';
  const gsm7Analysis = calculateSmsSegments(gsm7Text);
  console.log(`GSM-7 Text: "${gsm7Text}"`);
  console.log(`- Encoding: ${gsm7Analysis.encoding}, Segments: ${gsm7Analysis.segmentCount}, Chars: ${gsm7Analysis.characterCount}`);
  if (gsm7Analysis.encoding !== 'GSM-7' || gsm7Analysis.segmentCount !== 1) {
    throw new Error('GSM-7 character detection failed!');
  }

  // 1.2 Multi-segment GSM-7 (exceeding 160 characters)
  const longGsm7 = 'A'.repeat(161);
  const longAnalysis = calculateSmsSegments(longGsm7);
  console.log(`Long GSM-7 Text (161 chars): Segments=${longAnalysis.segmentCount}, Encoding=${longAnalysis.encoding}`);
  if (longAnalysis.segmentCount !== 2) {
    throw new Error(`Expected 2 segments for 161 GSM-7 chars, got ${longAnalysis.segmentCount}`);
  }

  // 1.3 Hausa hooked letters diacritic transliteration policy
  const hausaTextWithHooks = 'Sanarwa ga ɓangarori: Kada a ɗauki ƙarar ba tare da bincike ba. Ƴan uwa ku kiyaye.';
  const transliterated = normalizeForSms(hausaTextWithHooks, false);
  const preserved = normalizeForSms(hausaTextWithHooks, true);

  console.log(`Original Hausa: "${hausaTextWithHooks}"`);
  console.log(`Transliterated: "${transliterated}"`);
  console.log(`Preserved:      "${preserved}"`);

  const transAnalysis = calculateSmsSegments(transliterated);
  const presAnalysis = calculateSmsSegments(preserved);

  console.log(`- Transliterated: Encoding=${transAnalysis.encoding}, Segments=${transAnalysis.segmentCount}`);
  console.log(`- Preserved:      Encoding=${presAnalysis.encoding}, Segments=${presAnalysis.segmentCount}`);

  if (transAnalysis.encoding !== 'GSM-7') {
    throw new Error('Hausa transliteration failed to produce standard GSM-7 text!');
  }
  if (presAnalysis.encoding !== 'UCS-2') {
    throw new Error('Hausa preserved text failed to detect UCS-2 encoding!');
  }

  // 1.4 Emoji stripping and quote normalization
  const dirtyText = '🚨 AEGIS ALERT: “Danger reported” in ‘Zone A’… stay inside! 🏃💨';
  const cleanText = normalizeForSms(dirtyText, false);
  console.log(`Dirty text: "${dirtyText}"`);
  console.log(`Clean text: "${cleanText}"`);
  if (cleanText.includes('🚨') || cleanText.includes('🏃') || cleanText.includes('“')) {
    throw new Error('Emoji or smart quote normalization failed!');
  }
  console.log('✅ Part 1 passed: SMS Encoding, Normalization & Segment Analysis verified!\n');

  // =========================================================================
  // Part 2: Multilingual Message Templates & Fallback Chain
  // =========================================================================
  console.log('--- Part 2: Multilingual Message Templates & Fallback Chain ---');

  // 2.1 English (APPROVED)
  const englishAlert = renderAlertTemplate({
    templateType: 'ALERT_VERIFIED_INCIDENT',
    language: Language.ENGLISH,
    incidentNumber: 'INC-000001',
    incidentType: IncidentType.POSSIBLE_INTRUSION,
    areaName: 'Maitama Zone A',
    time: '14:30',
  });
  console.log('English Template:');
  console.log(`- Text: "${englishAlert.text}"`);
  console.log(`- Status: ${englishAlert.reviewStatus}, Fallback: ${englishAlert.fallbackOccurred}`);
  if (englishAlert.usedLanguage !== Language.ENGLISH || englishAlert.reviewStatus !== 'APPROVED') {
    throw new Error('English template verification failed!');
  }

  // 2.2 Hausa (APPROVED)
  const hausaAlert = renderAlertTemplate({
    templateType: 'ALERT_VERIFIED_INCIDENT',
    language: Language.HAUSA,
    incidentNumber: 'INC-000001',
    incidentType: IncidentType.POSSIBLE_INTRUSION,
    areaName: 'Maitama Zone A',
    time: '14:30',
  });
  console.log('Hausa Template:');
  console.log(`- Text: "${hausaAlert.text}"`);
  console.log(`- Status: ${hausaAlert.reviewStatus}, Fallback: ${hausaAlert.fallbackOccurred}`);
  if (hausaAlert.usedLanguage !== Language.HAUSA || hausaAlert.reviewStatus !== 'APPROVED') {
    throw new Error('Hausa template verification failed!');
  }

  // 2.3 Igbo with allowUnreviewed = false (must fall back to ENGLISH)
  const igboFallback = renderAlertTemplate({
    templateType: 'ALERT_VERIFIED_INCIDENT',
    language: Language.IGBO,
    incidentNumber: 'INC-000001',
    incidentType: IncidentType.POSSIBLE_INTRUSION,
    areaName: 'Maitama Zone A',
    time: '14:30',
    allowUnreviewed: false,
  });
  console.log('Igbo (Unreviewed=false):');
  console.log(`- Used Language: ${igboFallback.usedLanguage}, Fallback: ${igboFallback.fallbackOccurred}`);
  if (igboFallback.usedLanguage !== Language.ENGLISH || !igboFallback.fallbackOccurred) {
    throw new Error('Unreviewed Igbo translation should have fallen back to English!');
  }

  // 2.4 Yoruba with allowUnreviewed = true
  const yorubaAllowed = renderAlertTemplate({
    templateType: 'ALERT_VERIFIED_INCIDENT',
    language: Language.YORUBA,
    incidentNumber: 'INC-000001',
    incidentType: IncidentType.POSSIBLE_INTRUSION,
    areaName: 'Maitama Zone A',
    time: '14:30',
    allowUnreviewed: true,
  });
  console.log('Yoruba (Unreviewed=true):');
  console.log(`- Text: "${yorubaAlertText(yorubaAllowed.text)}"`);
  console.log(`- Status: ${yorubaAllowed.reviewStatus}, Fallback: ${yorubaAllowed.fallbackOccurred}`);
  if (yorubaAllowed.usedLanguage !== Language.YORUBA || yorubaAllowed.reviewStatus !== 'NEEDS_NATIVE_REVIEW') {
    throw new Error('Allowed unreviewed Yoruba template failed!');
  }

  // 2.5 ALL_CLEAR template
  const allClear = renderAlertTemplate({
    templateType: 'ALL_CLEAR',
    language: Language.ENGLISH,
    incidentNumber: 'INC-000001',
    incidentType: IncidentType.OTHER,
    areaName: 'Maitama Zone A',
    time: '15:15',
  });
  console.log(`ALL_CLEAR English: "${allClear.text}"`);
  if (!allClear.text.includes('All clear near Maitama Zone A')) {
    throw new Error('ALL_CLEAR template rendering failed!');
  }

  // 2.6 Coordinate Leakage Protection
  console.log('Testing Coordinate Leakage Protection:');
  const coordTest1 = containsCoordinates('9.0765, 7.3985');
  const coordTest2 = containsCoordinates('lat: 9.076, lng: 7.398');
  const cleanAreaTest = containsCoordinates('Maitama Zone A Landmark Near Mosque');
  console.log(`- '9.0765, 7.3985' detected as coordinate? ${coordTest1}`);
  console.log(`- 'lat: 9.076, lng: 7.398' detected as coordinate? ${coordTest2}`);
  console.log(`- 'Maitama Zone A Landmark' detected as coordinate? ${cleanAreaTest}`);

  if (!coordTest1 || !coordTest2 || cleanAreaTest) {
    throw new Error('Coordinate detection regex failed!');
  }

  let leakBlocked = false;
  try {
    sanitizeAreaName('9.0765, 7.3985');
  } catch (err: any) {
    leakBlocked = true;
    console.log(`- Correctly blocked coordinate leakage: "${err.message}"`);
  }
  if (!leakBlocked) {
    throw new Error('Area name with raw coordinates was not blocked!');
  }

  console.log('✅ Part 2 passed: Multilingual Templates & Coordinate Protection verified!\n');

  // =========================================================================
  // Part 3: SMS Provider Dispatch & Simulation
  // =========================================================================
  console.log('--- Part 3: SMS Provider Dispatch & Simulation ---');

  fakeSmsProvider.clearHistory();
  const dispatchResult = await fakeSmsProvider.send({
    to: '+2348012345678',
    message: englishAlert.text,
    incidentId: 'inc-test-01',
    alertId: 'alert-test-01',
  });

  console.log('Fake SMS Result:');
  console.log(`- Success: ${dispatchResult.success}`);
  console.log(`- Provider Msg ID: ${dispatchResult.providerMessageId}`);
  console.log(`- Encoding: ${dispatchResult.encoding}, Segments: ${dispatchResult.segmentCount}`);

  if (!dispatchResult.success || !dispatchResult.providerMessageId) {
    throw new Error('FakeSmsProvider dispatch failed!');
  }

  const history = fakeSmsProvider.getHistory();
  if (history.length !== 1) {
    throw new Error(`Expected 1 sent message in history, found ${history.length}`);
  }

  // Test Termii provider with unconfigured key (should return graceful failure, not throw)
  const termiiResult = await termiiSmsProvider.send({
    to: '+2348012345678',
    message: englishAlert.text,
  });
  console.log(`Termii Provider (unconfigured key test): Success=${termiiResult.success}, Error=${termiiResult.error}`);
  if (termiiResult.success) {
    throw new Error('Termii provider should fail gracefully when API key is missing!');
  }
  console.log('✅ Part 3 passed: SMS Providers & Simulations verified!\n');

  // =========================================================================
  // Part 4: Delivery Receipt Webhook & HMAC Verification
  // =========================================================================
  console.log('--- Part 4: Delivery Receipt Webhook & HMAC Verification ---');

  // Setup a test user and incident in the database
  const testUser = await prisma.user.findFirst({ where: { role: 'RESIDENT' } });
  const testIncident = await prisma.incident.findFirst();

  if (!testUser || !testIncident) {
    throw new Error('Database missing test user or incident for webhook test!');
  }

  // Delete any pre-existing alert for this user and incident to satisfy @@unique constraint
  await prisma.alert.deleteMany({
    where: {
      incidentId: testIncident.id,
      userId: testUser.id,
    },
  });

  // Create a fresh test Alert in QUEUED state
  const testAlert = await prisma.alert.create({
    data: {
      incidentId: testIncident.id,
      userId: testUser.id,
      phoneSnapshot: testUser.phone,
      language: Language.ENGLISH,
      message: englishAlert.text,
      status: AlertStatus.QUEUED,
    },
  });

  console.log(`Created test alert: ${testAlert.id} (Status: ${testAlert.status})`);

  // Dispatch through NotificationsService
  const alertDispatch = await notificationsService.dispatchAlert(testAlert.id);
  console.log(`Dispatched alert: Success=${alertDispatch.success}, MsgId=${alertDispatch.providerMessageId}`);

  const refreshedAlert = await prisma.alert.findUnique({ where: { id: testAlert.id } });
  if (refreshedAlert?.status !== AlertStatus.SENT) {
    throw new Error(`Expected alert to be in SENT status, found ${refreshedAlert?.status}`);
  }

  // 4.1 Test Webhook with invalid HMAC signature
  const webhookSecret = process.env.WEBHOOK_HMAC_SECRET || 'aegis-webhook-dev-secret-key-signature';
  const webhookPayload = {
    message_id: alertDispatch.providerMessageId!,
    status: 'DELIVERED',
    phone: testUser.phone,
    delivered_at: new Date().toISOString(),
  };
  const payloadString = JSON.stringify(webhookPayload);

  let invalidSigBlocked = false;
  try {
    await notificationsService.processDeliveryWebhook(
      webhookPayload,
      'invalid-hmac-signature-hex',
      String(Date.now()),
      payloadString,
    );
  } catch (err: any) {
    invalidSigBlocked = true;
    console.log(`- Correctly rejected invalid HMAC signature: "${err.message}"`);
  }
  if (!invalidSigBlocked) {
    throw new Error('Webhook accepted invalid HMAC signature!');
  }

  // 4.2 Test Webhook with stale timestamp (>5 mins)
  const validSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payloadString)
    .digest('hex');

  let staleTimestampBlocked = false;
  try {
    const staleTimestamp = String(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    await notificationsService.processDeliveryWebhook(
      webhookPayload,
      validSignature,
      staleTimestamp,
      payloadString,
    );
  } catch (err: any) {
    staleTimestampBlocked = true;
    console.log(`- Correctly rejected stale timestamp: "${err.message}"`);
  }
  if (!staleTimestampBlocked) {
    throw new Error('Webhook accepted stale timestamp (>5 mins)!');
  }

  // 4.3 Test Valid Delivery Webhook
  const currentTimestamp = String(Date.now());
  const deliveryResult = await notificationsService.processDeliveryWebhook(
    webhookPayload,
    validSignature,
    currentTimestamp,
    payloadString,
  );

  console.log('Valid Webhook Processing Result:', deliveryResult);
  if (!deliveryResult.success || deliveryResult.status !== 'DELIVERED') {
    throw new Error('Webhook failed to process valid delivery receipt!');
  }

  const deliveredAlert = await prisma.alert.findUnique({ where: { id: testAlert.id } });
  console.log(`Alert Status after delivery receipt: ${deliveredAlert?.status}, DeliveredAt: ${deliveredAlert?.deliveredAt}`);
  if (deliveredAlert?.status !== AlertStatus.DELIVERED || !deliveredAlert.deliveredAt) {
    throw new Error('Database alert was not updated to DELIVERED status!');
  }

  // 4.4 Test Duplicate Delivery Webhook (Idempotency)
  const duplicateResult = await notificationsService.processDeliveryWebhook(
    webhookPayload,
    validSignature,
    currentTimestamp,
    payloadString,
  );

  console.log('Duplicate Webhook Result (Idempotency):', duplicateResult);
  if (!duplicateResult.success || !duplicateResult.duplicate) {
    throw new Error('Duplicate delivery webhook was not handled idempotently!');
  }

  // Clean up test alert
  await prisma.alert.delete({ where: { id: testAlert.id } });
  console.log('✅ Part 4 passed: Delivery Receipt Webhook & HMAC Verification verified!\n');

  console.log('🎉 ALL DAY 6 TESTS PASSED SUCCESSFULLY! 🛡️');
  await prisma.$disconnect();
}

function yorubaAlertText(text: string): string {
  return text.length > 50 ? `${text.slice(0, 47)}...` : text;
}

main().catch((err) => {
  console.error('❌ Day 6 Test Suite Failed:', err);
  process.exit(1);
});

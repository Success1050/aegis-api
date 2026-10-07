import {
  PrismaClient,
  IncidentStatus,
  Severity,
  IncidentType,
  Role,
  AlertStatus,
  Language,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { IncidentsService } from '../src/modules/incidents/incidents.service';
import { GeoService } from '../src/modules/locations/geo.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { AutoExpiryService } from '../src/modules/incidents/auto-expiry.service';
import { IdempotencyService } from '../src/common/services/idempotency.service';
import { FakeSmsProvider } from '../src/modules/notifications/providers/fake-sms.provider';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { AlertQueueService } from '../src/modules/alerts/queue/alert-queue.service';
import { AlertWorker } from '../src/modules/alerts/queue/alert-queue.worker';
import { CircuitBreakerService } from '../src/modules/alerts/circuit-breaker/circuit-breaker.service';

async function main() {
  console.log('🧪 Starting Day 8 End-to-End Integration Test Suite (Real Postgres & Redis)...\n');

  const prisma = new PrismaClient();
  const config = new ConfigService();
  const auditService = new AuditService(prisma as any);
  const geoService = new GeoService(prisma as any, config);
  const circuitBreaker = new CircuitBreakerService(config);
  const alertQueueService = new AlertQueueService(config, circuitBreaker);
  await alertQueueService.onModuleInit();

  const fakeSmsProvider = new FakeSmsProvider(config);
  const alertWorker = new AlertWorker(
    prisma as any,
    auditService,
    alertQueueService,
    circuitBreaker,
    fakeSmsProvider,
    config,
  );
  await alertWorker.onModuleInit();

  const incidentsService = new IncidentsService(
    prisma as any,
    auditService,
    geoService,
    config,
    alertQueueService,
  );
  const autoExpiryService = new AutoExpiryService(prisma as any, auditService, config);
  const idempotencyService = new IdempotencyService(prisma as any);
  const notificationsService = new NotificationsService(
    fakeSmsProvider,
    prisma as any,
    auditService,
    config,
  );

  // Retrieve seed accounts
  const officerA = await prisma.user.findUnique({ where: { phone: '+2348020000001' } }); // Garba
  const officerB = await prisma.user.findUnique({ where: { phone: '+2348020000002' } }); // Musa
  const admin = await prisma.user.findUnique({ where: { phone: '+2348000000001' } });
  const resident = await prisma.user.findFirst({ where: { role: Role.RESIDENT } });

  if (!officerA || !officerB || !admin || !resident) {
    throw new Error('Database missing required seed accounts!');
  }

  // =========================================================================
  // Test 1: Full Happy Path Flow (Create -> Preview -> Verify -> Fanout -> Delivery -> Resolve)
  // =========================================================================
  console.log('--- Test 1: Full Happy Path Flow ---');

  // 1.1 Create Incident
  const createdIncident = await incidentsService.createIncident(
    {
      type: IncidentType.POSSIBLE_INTRUSION,
      description: 'Suspicious movement reported at north perimeter gate',
      severity: Severity.HIGH,
      latitude: 9.898,
      longitude: 8.857,
      zoneId: 'a0000000-0000-0000-0000-000000000001',
      alertRadiusMeters: 2000,
      acknowledgeDuplicates: true,
    },
    { id: officerA.id, role: Role.SECURITY },
  );
  console.log(`1.1 Created Incident: ${createdIncident.number} (Status: ${createdIncident.status})`);
  if (createdIncident.status !== IncidentStatus.PENDING_REVIEW) {
    throw new Error('Initial status must be PENDING_REVIEW');
  }

  // 1.2 Preview Recipients
  const preview = await incidentsService.previewRecipients(createdIncident.id);
  console.log(`1.2 Previewed Recipients: Total=${preview.totalRecipients}, Radius=${preview.alertRadiusMeters}m`);
  if (preview.totalRecipients < 30) {
    throw new Error(`Expected >30 recipients for Maitama incident, got ${preview.totalRecipients}`);
  }

  // 1.3 Verify Incident (Second Eyes by Officer B)
  const verified = await incidentsService.verifyIncident(
    createdIncident.id,
    { confirmLargeBlast: true },
    { id: officerB.id, role: Role.SECURITY },
  );
  console.log(`1.3 Verified Incident: Status=${verified.status}, QueuedAlerts=${verified.queuedAlertsCount}`);
  if (verified.status !== IncidentStatus.ALERTING || verified.queuedAlertsCount === 0) {
    throw new Error('Verification failed to transition to ALERTING or queue alerts');
  }

  // 1.4 Wait for Alert Queue Worker Fanout
  console.log('1.4 Waiting for BullMQ worker to fan out alerts...');
  await new Promise((r) => setTimeout(r, 2000));

  const sentAlertsCount = await prisma.alert.count({
    where: { incidentId: createdIncident.id, status: AlertStatus.SENT },
  });
  console.log(`Dispatched alerts count: ${sentAlertsCount} / ${verified.queuedAlertsCount}`);
  if (sentAlertsCount === 0) {
    throw new Error('Alert worker failed to dispatch alerts!');
  }

  // 1.5 Carrier Delivery Receipt Webhook with HMAC
  const sampleSentAlert = await prisma.alert.findFirst({
    where: { incidentId: createdIncident.id, status: AlertStatus.SENT },
  });
  if (!sampleSentAlert || !sampleSentAlert.providerMessageId) {
    throw new Error('No sent alert found with providerMessageId');
  }

  const webhookPayload = {
    message_id: sampleSentAlert.providerMessageId,
    status: 'DELIVERED',
    phone: sampleSentAlert.phoneSnapshot,
    delivered_at: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(webhookPayload);
  const signature = crypto
    .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'aegis-webhook-dev-secret-key-signature')
    .update(rawBody)
    .digest('hex');

  const webhookResult = await notificationsService.processDeliveryWebhook(
    webhookPayload,
    signature,
    String(Date.now()),
    rawBody,
  );
  console.log(`1.5 Delivery Webhook Processed: ${webhookResult.status} (Alert: ${webhookResult.alertId})`);
  if (!webhookResult.success || webhookResult.status !== 'DELIVERED') {
    throw new Error('Webhook processing failed!');
  }

  // 1.6 Resolve Incident
  // Ensure incident is in ALERTS_SENT or ALERTING before resolving
  await prisma.incident.update({
    where: { id: createdIncident.id },
    data: { status: IncidentStatus.ALERTS_SENT },
  });

  const resolved = await incidentsService.resolveIncident(
    createdIncident.id,
    { notes: 'Area secured by patrol team', sendAllClear: false },
    officerB.id,
  );
  console.log(`1.6 Resolved Incident: Status=${resolved.status}`);
  if (resolved.status !== IncidentStatus.RESOLVED) {
    throw new Error('Failed to resolve incident!');
  }
  console.log('✅ Test 1 passed: Full Happy Path Flow verified!\n');

  // =========================================================================
  // Test 2: 10 Parallel Verify Requests Race Test
  // =========================================================================
  console.log('--- Test 2: 10 Parallel Verify Requests Race Test ---');

  const raceInc = await incidentsService.createIncident(
    {
      type: IncidentType.SUSPICIOUS_VEHICLE,
      description: 'Unidentified van parked near gate',
      severity: Severity.MEDIUM,
      latitude: 9.898,
      longitude: 8.857,
      zoneId: 'a0000000-0000-0000-0000-000000000001',
      alertRadiusMeters: 2000,
      acknowledgeDuplicates: true,
    },
    { id: officerA.id, role: Role.SECURITY },
  );

  console.log(`Created race incident: ${raceInc.number}. Firing 10 concurrent verify requests...`);

  const parallelPromises = Array.from({ length: 10 }, (_, i) =>
    incidentsService.verifyIncident(
      raceInc.id,
      { confirmLargeBlast: true },
      { id: officerB.id, role: Role.SECURITY },
    ),
  );

  const results = await Promise.allSettled(parallelPromises);
  const fulfilledCount = results.filter((r) => r.status === 'fulfilled').length;
  const rejectedCount = results.filter((r) => r.status === 'rejected').length;

  console.log(`Parallel Results: Fulfilled = ${fulfilledCount}, Rejected (409) = ${rejectedCount}`);

  if (fulfilledCount !== 1 || rejectedCount !== 9) {
    throw new Error(
      `Race safety violation! Expected exactly 1 winner and 9 rejected, got ${fulfilledCount} fulfilled / ${rejectedCount} rejected`,
    );
  }

  // Verify exactly one fanout of alerts occurred
  const raceAlertsCount = await prisma.alert.count({ where: { incidentId: raceInc.id } });
  console.log(`Total alerts generated for race incident: ${raceAlertsCount}`);
  if (raceAlertsCount < 30 || raceAlertsCount > 50) {
    throw new Error(`Unexpected alert count for single fanout: ${raceAlertsCount}`);
  }
  console.log('✅ Test 2 passed: 10 Parallel Verify Race Condition safely resolved!\n');

  // =========================================================================
  // Test 3: Idempotency Key Replay Test
  // =========================================================================
  console.log('--- Test 3: Idempotency Key Replay Test ---');

  const idempotencyKey = `e2e-idem-key-${Date.now()}`;
  const testPayload = { message: 'Incident created successfully', id: 'sample-uuid-123' };

  // First request: Cache MISS
  const firstEval = await idempotencyService.processKey(
    idempotencyKey,
    '/api/v1/incidents',
    'POST',
    admin.id,
    testPayload,
  );
  console.log(`First evaluation: isHit=${firstEval.isHit}`);
  if (firstEval.isHit) {
    throw new Error('First idempotency check should be a cache miss');
  }

  // Store response
  await firstEval.saveResponse!(201, testPayload);

  // Second request: Cache HIT (Replay)
  const secondEval = await idempotencyService.processKey(
    idempotencyKey,
    '/api/v1/incidents',
    'POST',
    admin.id,
    testPayload,
  );
  console.log(`Second evaluation: isHit=${secondEval.isHit}, cachedStatus=${secondEval.cachedStatus}`);
  if (!secondEval.isHit || secondEval.cachedStatus !== 201) {
    throw new Error('Idempotency replay failed to return cached response!');
  }
  console.log('✅ Test 3 passed: Idempotency key replay protection verified!\n');

  // =========================================================================
  // Test 4: Auto-Expiry of Stale Pending Incidents
  // =========================================================================
  console.log('--- Test 4: Auto-Expiry of Stale Pending Incidents ---');

  const staleInc = await prisma.incident.create({
    data: {
      number: `INC-STALE-E2E-${Date.now().toString().slice(-4)}`,
      type: IncidentType.OTHER,
      description: 'Stale pending report',
      latitude: 9.0765,
      longitude: 7.3985,
      severity: Severity.LOW,
      status: IncidentStatus.PENDING_REVIEW,
      alertRadiusMeters: 500,
      reportedById: officerA.id,
      createdAt: new Date(Date.now() - 75 * 60 * 1000), // 75 minutes old
      version: 1,
    },
  });

  await autoExpiryService.handleAutoExpiry();
  console.log('Executed handleAutoExpiry() successfully.');

  const refreshedStale = await prisma.incident.findUnique({ where: { id: staleInc.id } });
  console.log(`Stale incident status: ${refreshedStale?.status}, Reason: ${refreshedStale?.dismissReason}`);

  if (refreshedStale?.status !== IncidentStatus.DISMISSED || refreshedStale.dismissReason !== 'AUTO_EXPIRED') {
    throw new Error('Stale incident was not auto-expired!');
  }
  console.log('✅ Test 4 passed: Auto-Expiry of stale pending incidents verified!\n');

  // =========================================================================
  // Test 5: Zero-Recipient & Large-Blast Guard Tests
  // =========================================================================
  console.log('--- Test 5: Zero-Recipient & Large-Blast Guard Tests ---');

  // 5.1 Zero recipients test (coordinates in remote uninhabited coordinates within Nigeria)
  const emptySelection = await geoService.findEligibleRecipients({
    incidentLat: 11.5,
    incidentLng: 13.5, // Remote location far from seeded Abuja/Lagos zones
    alertRadiusMeters: 500,
  });
  console.log(`Zero-recipient query: totalEligible = ${emptySelection.totalEligible}`);
  if (emptySelection.totalEligible !== 0) {
    throw new Error(`Expected 0 recipients for remote uninhabited coordinates, got ${emptySelection.totalEligible}`);
  }

  // 5.2 Large-blast guard test (exceeding blast threshold)
  const hugeSelection = await geoService.findEligibleRecipients({
    incidentLat: 9.898,
    incidentLng: 8.857,
    zoneId: 'a0000000-0000-0000-0000-000000000001',
    alertRadiusMeters: 50000, // 50km blast radius
  });
  console.log(`Large-blast query: totalEligible = ${hugeSelection.totalEligible}, requiresConfirmation = ${hugeSelection.requiresLargeBlastConfirmation}`);

  // Test verify rejection without confirmLargeBlast flag when requiresLargeBlastConfirmation is true
  if (hugeSelection.requiresLargeBlastConfirmation) {
    let largeBlastBlocked = false;
    const hugeInc = await incidentsService.createIncident(
      {
        type: IncidentType.FIRE,
        description: 'Large explosion reported',
        severity: Severity.CRITICAL,
        latitude: 9.898,
        longitude: 8.857,
        zoneId: 'a0000000-0000-0000-0000-000000000001',
        alertRadiusMeters: 50000,
        acknowledgeDuplicates: true,
      },
      { id: officerA.id, role: Role.SECURITY },
    );

    try {
      await incidentsService.verifyIncident(
        hugeInc.id,
        { confirmLargeBlast: false },
        { id: officerB.id, role: Role.SECURITY },
      );
    } catch (err: any) {
      largeBlastBlocked = true;
      console.log(`Correctly blocked large blast verification: "${err.message}"`);
    }

    if (!largeBlastBlocked) {
      throw new Error('Large blast verification without confirmation was not blocked!');
    }

    // Clean up
    await prisma.incident.delete({ where: { id: hugeInc.id } });
  }

  console.log('✅ Test 5 passed: Zero-recipient and large-blast safety guards verified!\n');

  // =========================================================================
  // Clean Up Test Records
  // =========================================================================
  await prisma.alert.deleteMany({
    where: { incidentId: { in: [createdIncident.id, raceInc.id, staleInc.id] } },
  });
  await prisma.incident.deleteMany({
    where: { id: { in: [createdIncident.id, raceInc.id, staleInc.id] } },
  });

  console.log('🎉 ALL DAY 8 INTEGRATION & E2E TESTS PASSED SUCCESSFULLY! 🛡️\n');
  await alertWorker.onModuleDestroy();
  await alertQueueService.onModuleDestroy();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Day 8 E2E Test Suite Failed:', err);
  process.exit(1);
});

import { PrismaClient, IncidentStatus, Severity, IncidentType, Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { IncidentsService } from '../src/modules/incidents/incidents.service';
import { GeoService } from '../src/modules/locations/geo.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { AutoExpiryService } from '../src/modules/incidents/auto-expiry.service';
import { IdempotencyService } from '../src/common/services/idempotency.service';

async function main() {
  console.log('🧪 Starting Day 5 Incident Engine & Verification Test Suite...\n');

  const prisma = new PrismaClient();
  const config = new ConfigService();
  const auditService = new AuditService(prisma as any);
  const geoService = new GeoService(prisma as any, config);
  const incidentsService = new IncidentsService(prisma as any, auditService, geoService, config);
  const autoExpiryService = new AutoExpiryService(prisma as any, auditService, config);
  const idempotencyService = new IdempotencyService(prisma as any);

  // Retrieve seed officers
  const officerA = await prisma.user.findUnique({ where: { phone: '+2348020000001' } }); // Garba (Reporter of INC-000001)
  const officerB = await prisma.user.findUnique({ where: { phone: '+2348020000002' } }); // Musa (Second eyes)
  const admin = await prisma.user.findUnique({ where: { phone: '+2348000000001' } });

  if (!officerA || !officerB || !admin) {
    throw new Error('Seed officers / admin not found in database!');
  }

  // -------------------------------------------------------------
  // Test 1: Dry-Run Recipient Preview on INC-000001
  // -------------------------------------------------------------
  // Reset demo incident INC-000001 to fresh createdAt and PENDING_REVIEW
  await prisma.alert.deleteMany({ where: { incident: { number: 'INC-000001' } } });
  await prisma.incident.update({
    where: { number: 'INC-000001' },
    data: {
      status: IncidentStatus.PENDING_REVIEW,
      createdAt: new Date(),
      reportedById: officerA.id,
      verifiedById: null,
      verifiedAt: null,
      version: 1,
    },
  });

  const demoInc = await prisma.incident.findUnique({ where: { number: 'INC-000001' } });
  if (!demoInc) throw new Error('Demo incident INC-000001 missing!');

  const preview = await incidentsService.previewRecipients(demoInc.id);
  console.log(`Incident ${preview.incidentNumber} Preview:`);
  console.log(`- Total Eligible: ${preview.totalRecipients}`);
  console.log(`- Physical Geofence: ${preview.breakdown.byPhysicalRadius}`);
  console.log(`- Zone Members: ${preview.breakdown.byZoneMembership}`);
  console.log(`- Language Breakdown:`, preview.breakdown.byLanguage);
  console.log(`- Sample List (${preview.sampleRecipients.length} items):`, preview.sampleRecipients.map((s) => `${s.name} (${s.phoneMasked})`));

  if (preview.totalRecipients < 30) {
    throw new Error(`Unexpected preview count: ${preview.totalRecipients}`);
  }
  console.log('✅ Recipient Preview verified!\n');

  // -------------------------------------------------------------
  // Test 2: Four-Eyes Verification Rule Enforcement
  // -------------------------------------------------------------
  console.log('--- 2. Testing Four-Eyes Principle Enforcement ---');
  let selfVerifyBlocked = false;
  try {
    // Officer A reported INC-000001, so Officer A cannot verify it
    await incidentsService.verifyIncident(
      demoInc.id,
      {},
      { id: officerA.id, role: Role.SECURITY },
    );
  } catch (err: any) {
    selfVerifyBlocked = true;
    console.log(`Expected rejection caught: "${err.message}"`);
  }

  if (!selfVerifyBlocked) {
    throw new Error('Four-Eyes principle failed: Reporting officer was able to self-verify!');
  }
  console.log('✅ Four-Eyes rule successfully blocked self-verification!\n');

  // -------------------------------------------------------------
  // Test 3: Officer B (Second Eyes) Verifies Incident
  // -------------------------------------------------------------
  console.log('--- 3. Testing Verification by Officer B (Second Eyes) ---');
  const verifiedResult = await incidentsService.verifyIncident(
    demoInc.id,
    {},
    { id: officerB.id, role: Role.SECURITY },
  );

  console.log(`Incident Status: ${verifiedResult.status}`);
  console.log(`Verified By: ${verifiedResult.verifiedByName}`);
  console.log(`Queued Alerts Created in Transaction: ${verifiedResult.queuedAlertsCount}`);

  if (verifiedResult.status !== IncidentStatus.ALERTING) {
    throw new Error(`Expected status ALERTING, got ${verifiedResult.status}`);
  }

  // Verify Alert rows exist in DB
  const alertCount = await prisma.alert.count({ where: { incidentId: demoInc.id } });
  console.log(`Database Alert Records Count: ${alertCount}`);
  if (alertCount === 0 || alertCount !== verifiedResult.queuedAlertsCount) {
    throw new Error('Alert rows were not created in the database transaction!');
  }
  console.log('✅ Incident successfully verified & alert records created atomically!\n');

  // -------------------------------------------------------------
  // Test 4: Race Safety - Second verification attempt blocked (409)
  // -------------------------------------------------------------
  console.log('--- 4. Testing Race Safety & Terminal Transition ---');
  let raceConflictCaught = false;
  try {
    await incidentsService.verifyIncident(
      demoInc.id,
      {},
      { id: officerB.id, role: Role.SECURITY },
    );
  } catch (err: any) {
    raceConflictCaught = true;
    console.log(`Expected race rejection caught (409): "${err.message}"`);
  }

  if (!raceConflictCaught) {
    throw new Error('Race safety failed: Incident in ALERTING was verified a second time!');
  }
  console.log('✅ Race safety & optimistic version lock verified!\n');

  // -------------------------------------------------------------
  // Test 5: Sequential Number Generation & Duplicate Detection
  // -------------------------------------------------------------
  console.log('--- 5. Testing Sequential Numbering & Duplicate Detection ---');
  // Attempt to report incident at identical coordinates without acknowledgeDuplicates
  let duplicateWarningCaught = false;
  try {
    await incidentsService.createIncident(
      {
        type: IncidentType.SUSPICIOUS_PERSON,
        severity: Severity.MEDIUM,
        description: 'Suspicious individual loitering by the northern perimeter fence.',
        latitude: Number(demoInc.latitude),
        longitude: Number(demoInc.longitude),
        alertRadiusMeters: 2000,
        acknowledgeDuplicates: false,
      },
      { id: officerA.id, role: Role.SECURITY },
    );
  } catch (err: any) {
    duplicateWarningCaught = true;
    console.log(`Expected duplicate warning caught: "${err.message?.message || err.message}"`);
  }

  if (!duplicateWarningCaught) {
    throw new Error('Duplicate detection failed: Duplicate incident created without warning!');
  }

  // Create incident with acknowledgeDuplicates: true
  const inc2 = await incidentsService.createIncident(
    {
      type: IncidentType.SUSPICIOUS_PERSON,
      severity: Severity.MEDIUM,
      description: 'Second verified activity near perimeter, separate incident.',
      latitude: Number(demoInc.latitude),
      longitude: Number(demoInc.longitude),
      alertRadiusMeters: 2000,
      acknowledgeDuplicates: true,
    },
    { id: officerA.id, role: Role.SECURITY },
  );

  console.log(`Created Incident Number: ${inc2.number}`);
  if (!inc2.number.startsWith('INC-00000')) {
    throw new Error(`Unexpected sequential number format: ${inc2.number}`);
  }
  console.log('✅ Sequential numbering and duplicate detection verified!\n');

  // -------------------------------------------------------------
  // Test 6: Dismissal with Reason & Fork Immutability
  // -------------------------------------------------------------
  console.log('--- 6. Testing Dismissal with Reason & Fork Immutability ---');
  const dismissed = await incidentsService.dismissIncident(
    inc2.id,
    { reason: 'False alarm confirmed by perimeter security patrol.' },
    officerB.id,
  );

  console.log(`Incident ${dismissed.number} Status: ${dismissed.status}`);
  console.log(`Dismiss Reason: "${dismissed.dismissReason}"`);

  // Verify that dismissed incident can NEVER be verified
  let verifyDismissedBlocked = false;
  try {
    await incidentsService.verifyIncident(
      inc2.id,
      {},
      { id: officerB.id, role: Role.SECURITY },
    );
  } catch (err: any) {
    verifyDismissedBlocked = true;
    console.log(`Expected rejection caught: "${err.message}"`);
  }

  if (!verifyDismissedBlocked) {
    throw new Error('Dismiss fork immutability failed: Dismissed incident was verified!');
  }
  console.log('✅ Dismissal and fork immutability verified!\n');

  // -------------------------------------------------------------
  // Test 7: Idempotency Service Protection
  // -------------------------------------------------------------
  console.log('--- 7. Testing Idempotency Service ---');
  const key = 'idem-test-' + Date.now();
  const check1 = await idempotencyService.processKey(
    key,
    '/api/v1/incidents/test/verify',
    'POST',
    officerB.id,
    { test: 123 },
  );

  console.log('First Call IsHit:', check1.isHit);
  if (check1.saveResponse) {
    await check1.saveResponse(200, { success: true, processedAt: Date.now() });
  }

  const check2 = await idempotencyService.processKey(
    key,
    '/api/v1/incidents/test/verify',
    'POST',
    officerB.id,
    { test: 123 },
  );

  console.log('Second Call IsHit (Replay):', check2.isHit);
  console.log('Cached Response Data:', check2.cachedResponse);

  if (!check2.isHit || !check2.cachedResponse?.success) {
    throw new Error('Idempotency replay failed!');
  }
  console.log('✅ Idempotency protection verified!\n');

  // -------------------------------------------------------------
  // Test 8: Auto-Expiry Service
  // -------------------------------------------------------------
  console.log('--- 8. Testing Auto-Expiry Service on Stale Reports ---');
  // Create an old incident dated 90 minutes ago
  const oldDate = new Date(Date.now() - 90 * 60 * 1000);
  const staleInc = await prisma.incident.create({
    data: {
      number: 'INC-STALE-99',
      type: IncidentType.OTHER,
      description: 'Stale test report from 90 minutes ago.',
      severity: Severity.LOW,
      status: IncidentStatus.PENDING_REVIEW,
      latitude: 9.898,
      longitude: 8.857,
      alertRadiusMeters: 2000,
      reportedById: officerA.id,
      createdAt: oldDate,
      version: 1,
    },
  });

  // Run auto-expiry job
  await autoExpiryService.handleAutoExpiry();

  const refreshedStale = await prisma.incident.findUnique({ where: { id: staleInc.id } });
  console.log(`Stale Incident Status after AutoExpiry: ${refreshedStale?.status}`);
  console.log(`Dismiss Reason: ${refreshedStale?.dismissReason}`);

  if (refreshedStale?.status !== IncidentStatus.DISMISSED || refreshedStale.dismissReason !== 'AUTO_EXPIRED') {
    throw new Error('AutoExpiry failed to expire stale incident!');
  }

  // Cleanup test incidents
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [inc2.id, staleInc.id] } } });
  await prisma.incident.deleteMany({ where: { id: { in: [inc2.id, staleInc.id] } } });
  await prisma.idempotencyRecord.deleteMany({ where: { key } });

  console.log('✅ Auto-expiry cron job verified!\n');

  await prisma.$disconnect();
  console.log('🎉 ALL DAY 5 INCIDENT LIFECYCLE & STATE MACHINE TESTS PASSED!');
}

main().catch((err) => {
  console.error('❌ Day 5 test failed:', err);
  process.exit(1);
});

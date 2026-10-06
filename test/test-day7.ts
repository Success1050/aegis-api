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
import { FakeSmsProvider } from '../src/modules/notifications/providers/fake-sms.provider';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { AlertQueueService } from '../src/modules/alerts/queue/alert-queue.service';
import { AlertWorker } from '../src/modules/alerts/queue/alert-queue.worker';
import { AlertReconcilerService } from '../src/modules/alerts/reconciler/alert-reconciler.service';
import { CircuitBreakerService } from '../src/modules/alerts/circuit-breaker/circuit-breaker.service';
import { AlertJobData } from '../src/modules/alerts/queue/alert-queue.types';

async function main() {
  console.log('🧪 Starting Day 7 Alert Engine, Queue Worker & Resilience Test Suite...\n');

  const prisma = new PrismaClient();
  const config = new ConfigService();
  const auditService = new AuditService(prisma as any);
  const fakeSmsProvider = new FakeSmsProvider(config);
  const circuitBreaker = new CircuitBreakerService(config);
  const alertQueueService = new AlertQueueService(config, circuitBreaker);
  await alertQueueService.onModuleInit();

  const alertWorker = new AlertWorker(
    prisma as any,
    auditService,
    alertQueueService,
    circuitBreaker,
    fakeSmsProvider,
    config,
  );
  await alertWorker.onModuleInit();

  const reconciler = new AlertReconcilerService(
    prisma as any,
    auditService,
    alertQueueService,
    alertWorker,
  );

  // Retrieve existing users for test harnesses
  const resident = await prisma.user.findFirst({ where: { role: Role.RESIDENT } });
  const security = await prisma.user.findFirst({ where: { role: Role.SECURITY } });
  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });

  if (!resident || !security || !admin) {
    throw new Error('Database must have resident, security, and admin seed accounts!');
  }

  // =========================================================================
  // Part 1: Circuit Breaker Mechanics
  // =========================================================================
  console.log('--- Part 1: Circuit Breaker Mechanics ---');
  circuitBreaker.reset();
  if (circuitBreaker.getState() !== 'CLOSED') {
    throw new Error('Circuit breaker initial state should be CLOSED');
  }

  // Simulate 9 failures (under threshold 10)
  for (let i = 0; i < 9; i++) {
    circuitBreaker.recordFailure('Simulated failure');
  }
  if (circuitBreaker.isOpen()) {
    throw new Error('Circuit breaker should NOT trip at 9 failures');
  }

  // 10th failure must trip
  const tripped = circuitBreaker.recordFailure('Simulated failure 10');
  if (!tripped || !circuitBreaker.isOpen()) {
    throw new Error('Circuit breaker failed to trip at 10 consecutive failures!');
  }
  console.log('Circuit Breaker Metrics (Tripped):', circuitBreaker.getMetrics());

  // Manual reset
  circuitBreaker.reset();
  if (circuitBreaker.isOpen() || circuitBreaker.getState() !== 'CLOSED') {
    throw new Error('Circuit breaker manual reset failed!');
  }
  console.log('✅ Part 1 passed: Circuit Breaker Mechanics verified!\n');

  // =========================================================================
  // Part 2: Priority Ordering (SECURITY before RESIDENT)
  // =========================================================================
  console.log('--- Part 2: Priority Dispatch Ordering ---');
  const executionOrder: string[] = [];

  // Temporarily intercept worker handler to record processing sequence
  const customQueueService = new AlertQueueService(config, circuitBreaker);
  customQueueService.registerWorkerHandler(async (data: AlertJobData) => {
    executionOrder.push(`${data.userRole}:${data.severity}`);
  });

  await customQueueService.enqueueBatch([
    {
      alertId: 'job-res-low',
      incidentId: 'inc-p1',
      userId: resident.id,
      userRole: Role.RESIDENT,
      phone: resident.phone,
      message: 'Test',
      severity: Severity.LOW,
    },
    {
      alertId: 'job-sec-crit',
      incidentId: 'inc-p1',
      userId: security.id,
      userRole: Role.SECURITY,
      phone: security.phone,
      message: 'Test',
      severity: Severity.CRITICAL,
    },
    {
      alertId: 'job-res-crit',
      incidentId: 'inc-p1',
      userId: resident.id,
      userRole: Role.RESIDENT,
      phone: resident.phone,
      message: 'Test',
      severity: Severity.CRITICAL,
    },
    {
      alertId: 'job-sec-med',
      incidentId: 'inc-p1',
      userId: security.id,
      userRole: Role.SECURITY,
      phone: security.phone,
      message: 'Test',
      severity: Severity.MEDIUM,
    },
  ]);

  // Wait for in-memory queue flush
  await new Promise((r) => setTimeout(r, 200));

  console.log('Actual Queue Execution Order:', executionOrder);
  // Expected order:
  // 1. SECURITY:CRITICAL
  // 2. SECURITY:MEDIUM
  // 3. RESIDENT:CRITICAL
  // 4. RESIDENT:LOW
  if (
    executionOrder[0] !== 'SECURITY:CRITICAL' ||
    executionOrder[1] !== 'SECURITY:MEDIUM' ||
    executionOrder[2] !== 'RESIDENT:CRITICAL' ||
    executionOrder[3] !== 'RESIDENT:LOW'
  ) {
    throw new Error(`Priority dispatch ordering failed! Received: ${executionOrder.join(' -> ')}`);
  }
  console.log('✅ Part 2 passed: Priority Scheduling verified (Security > Resident; Critical > Low)!\n');

  // =========================================================================
  // Part 3: Atomic Transition & Double-Send Race Prevention
  // =========================================================================
  console.log('--- Part 3: Atomic Transition & Double-Send Race Prevention ---');

  // Create isolated test incident and alert
  const raceIncident = await prisma.incident.create({
    data: {
      number: `INC-TEST-RACE-${Date.now().toString().slice(-4)}`,
      type: IncidentType.POSSIBLE_INTRUSION,
      description: 'Race condition validation test',
      latitude: 9.0765,
      longitude: 7.3985,
      severity: Severity.HIGH,
      status: IncidentStatus.ALERTING,
      alertRadiusMeters: 1000,
      reportedById: security.id,
      version: 1,
    },
  });

  const raceAlert = await prisma.alert.create({
    data: {
      incidentId: raceIncident.id,
      userId: resident.id,
      phoneSnapshot: resident.phone,
      language: Language.ENGLISH,
      message: 'Race safety test message',
      status: AlertStatus.QUEUED,
    },
  });

  // Simulate two concurrent workers racing on the exact same alert job
  const jobData: AlertJobData = {
    alertId: raceAlert.id,
    incidentId: raceIncident.id,
    userId: resident.id,
    userRole: Role.RESIDENT,
    phone: resident.phone,
    message: raceAlert.message,
    severity: Severity.HIGH,
  };

  fakeSmsProvider.clearHistory();
  await Promise.all([
    alertWorker.processAlertJob(jobData),
    alertWorker.processAlertJob(jobData),
  ]);

  const history = fakeSmsProvider.findSentByAlertId(raceAlert.id);
  console.log(`Dispatched SMS calls for alert ${raceAlert.id}: ${history ? 1 : 0}`);
  if (fakeSmsProvider.getHistory().filter((h) => h.input.alertId === raceAlert.id).length !== 1) {
    throw new Error('Double-send race test failed: SMS was dispatched more than once!');
  }

  const finalRaceAlert = await prisma.alert.findUnique({ where: { id: raceAlert.id } });
  if (finalRaceAlert?.status !== AlertStatus.SENT) {
    throw new Error(`Expected final status SENT, got ${finalRaceAlert?.status}`);
  }
  console.log('✅ Part 3 passed: Atomic double-send protection verified!\n');

  // =========================================================================
  // Part 4: Atomic "Last One Out" Incident Finalization
  // =========================================================================
  console.log('--- Part 4: Atomic "Last One Out" Incident Finalization ---');

  // Create test incident with 2 alerts
  const fanoutIncident = await prisma.incident.create({
    data: {
      number: `INC-TEST-FANOUT-${Date.now().toString().slice(-4)}`,
      type: IncidentType.SUSPICIOUS_PERSON,
      description: 'Last one out finalization test',
      latitude: 9.0765,
      longitude: 7.3985,
      severity: Severity.MEDIUM,
      status: IncidentStatus.ALERTING,
      alertRadiusMeters: 500,
      reportedById: security.id,
      version: 1,
    },
  });

  const alert1 = await prisma.alert.create({
    data: {
      incidentId: fanoutIncident.id,
      userId: security.id,
      phoneSnapshot: security.phone,
      language: Language.ENGLISH,
      message: 'Fanout test 1',
      status: AlertStatus.QUEUED,
    },
  });

  const alert2 = await prisma.alert.create({
    data: {
      incidentId: fanoutIncident.id,
      userId: resident.id,
      phoneSnapshot: resident.phone,
      language: Language.ENGLISH,
      message: 'Fanout test 2',
      status: AlertStatus.QUEUED,
    },
  });

  // Process 1st alert: incident must still be in ALERTING
  await alertWorker.processAlertJob({
    alertId: alert1.id,
    incidentId: fanoutIncident.id,
    userId: security.id,
    userRole: Role.SECURITY,
    phone: security.phone,
    message: alert1.message,
    severity: Severity.MEDIUM,
  });

  let checkInc = await prisma.incident.findUnique({ where: { id: fanoutIncident.id } });
  console.log(`Incident status after Alert 1 processed: ${checkInc?.status}`);
  if (checkInc?.status !== IncidentStatus.ALERTING) {
    throw new Error(`Incident should remain ALERTING after 1 of 2 alerts, got ${checkInc?.status}`);
  }

  // Process 2nd alert (Last One Out): incident must finalize to ALERTS_SENT
  await alertWorker.processAlertJob({
    alertId: alert2.id,
    incidentId: fanoutIncident.id,
    userId: resident.id,
    userRole: Role.RESIDENT,
    phone: resident.phone,
    message: alert2.message,
    severity: Severity.MEDIUM,
  });

  checkInc = await prisma.incident.findUnique({ where: { id: fanoutIncident.id } });
  console.log(`Incident status after Alert 2 (Last One Out): ${checkInc?.status}`);
  console.log(`Incident alertsCompletedAt: ${checkInc?.alertsCompletedAt}`);

  if (checkInc?.status !== IncidentStatus.ALERTS_SENT || !checkInc.alertsCompletedAt) {
    throw new Error(`Incident failed to transition to ALERTS_SENT upon last alert completion!`);
  }
  console.log('✅ Part 4 passed: "Last One Out" incident finalization verified!\n');

  // =========================================================================
  // Part 5: Boot Recovery & Periodic Reconciler
  // =========================================================================
  console.log('--- Part 5: Boot Recovery & Periodic Reconciler ---');

  // Create an incident stuck in ALERTING with a stale SENDING alert (>15m)
  const stuckIncident = await prisma.incident.create({
    data: {
      number: `INC-STUCK-${Date.now().toString().slice(-4)}`,
      type: IncidentType.FIRE,
      description: 'Stuck alert recovery test',
      latitude: 9.0765,
      longitude: 7.3985,
      severity: Severity.CRITICAL,
      status: IncidentStatus.ALERTING,
      alertRadiusMeters: 2000,
      reportedById: security.id,
      version: 1,
    },
  });

  const staleAlert = await prisma.alert.create({
    data: {
      incidentId: stuckIncident.id,
      userId: resident.id,
      phoneSnapshot: resident.phone,
      language: Language.ENGLISH,
      message: 'Stale test message',
      status: AlertStatus.SENDING,
      attempts: 1,
      updatedAt: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago
    },
  });

  // Run reconciler
  const reconResult = await reconciler.recoverStuckAlerts();
  console.log('Reconciler recovery result:', reconResult);

  if (reconResult.recoveredCount < 1) {
    throw new Error(`Expected at least 1 recovered stuck alert, got ${reconResult.recoveredCount}`);
  }

  // Wait for worker to re-process recovered job (BullMQ rate limited)
  await new Promise((r) => setTimeout(r, 1500));

  const recoveredAlert = await prisma.alert.findUnique({ where: { id: staleAlert.id } });
  console.log(`Alert status after reconciler recovery: ${recoveredAlert?.status}`);
  if (recoveredAlert?.status !== AlertStatus.SENT) {
    throw new Error(`Recovered alert did not transition to SENT, found ${recoveredAlert?.status}`);
  }

  const finalizedStuckInc = await prisma.incident.findUnique({ where: { id: stuckIncident.id } });
  console.log(`Stuck incident status after recovery: ${finalizedStuckInc?.status}`);
  if (finalizedStuckInc?.status !== IncidentStatus.ALERTS_SENT) {
    throw new Error(`Stuck incident was not finalized to ALERTS_SENT!`);
  }
  console.log('✅ Part 5 passed: Boot Recovery & Periodic Reconciler verified!\n');

  // =========================================================================
  // Part 6: Manual Retry for Failed Alerts
  // =========================================================================
  console.log('--- Part 6: Manual Retry for Failed Alerts ---');

  // Create an incident with 1 failed alert in ALERTS_PARTIALLY_FAILED status
  const failedIncident = await prisma.incident.create({
    data: {
      number: `INC-RETRY-${Date.now().toString().slice(-4)}`,
      type: IncidentType.OTHER,
      description: 'Manual retry test',
      latitude: 9.0765,
      longitude: 7.3985,
      severity: Severity.LOW,
      status: IncidentStatus.ALERTS_PARTIALLY_FAILED,
      alertRadiusMeters: 500,
      reportedById: security.id,
      version: 1,
    },
  });

  const failedAlert = await prisma.alert.create({
    data: {
      incidentId: failedIncident.id,
      userId: resident.id,
      phoneSnapshot: resident.phone,
      language: Language.ENGLISH,
      message: 'Failed test message',
      status: AlertStatus.FAILED,
      attempts: 5,
      lastError: 'Simulated telecom timeout',
    },
  });

  const retryResult = await reconciler.retryFailedAlerts(
    failedIncident.id,
    admin.id,
  );
  console.log('Manual retry result:', retryResult);

  if (retryResult.retriedCount !== 1 || retryResult.incidentStatus !== IncidentStatus.ALERTING) {
    throw new Error('Manual retry failed to reset alert and transition incident to ALERTING!');
  }

  // Wait for worker to re-dispatch the retried alert
  await new Promise((r) => setTimeout(r, 1000));

  const retriedAlertDb = await prisma.alert.findUnique({ where: { id: failedAlert.id } });
  console.log(`Retried alert status after worker processed: ${retriedAlertDb?.status}`);
  if (retriedAlertDb?.status !== AlertStatus.SENT) {
    throw new Error(`Expected retried alert to be SENT, got ${retriedAlertDb?.status}`);
  }

  const retriedIncDb = await prisma.incident.findUnique({ where: { id: failedIncident.id } });
  console.log(`Incident status after retried alert finalized: ${retriedIncDb?.status}`);
  if (retriedIncDb?.status !== IncidentStatus.ALERTS_SENT) {
    throw new Error(`Expected incident to reach ALERTS_SENT after retry, got ${retriedIncDb?.status}`);
  }
  console.log('✅ Part 6 passed: Manual Retry for Failed Alerts verified!\n');

  // =========================================================================
  // Clean Up Test Incidents
  // =========================================================================
  await prisma.alert.deleteMany({
    where: {
      incidentId: {
        in: [raceIncident.id, fanoutIncident.id, stuckIncident.id, failedIncident.id],
      },
    },
  });
  await prisma.incident.deleteMany({
    where: {
      id: { in: [raceIncident.id, fanoutIncident.id, stuckIncident.id, failedIncident.id] },
    },
  });

  console.log('🎉 ALL DAY 7 ALERT ENGINE & RESILIENCE TESTS PASSED! 🛡️\n');
  await alertWorker.onModuleDestroy();
  await alertQueueService.onModuleDestroy();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Day 7 Test Suite Failed:', err);
  process.exit(1);
});

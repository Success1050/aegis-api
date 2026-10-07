# AEGIS — Operational Runbook & Incident Response Guide

This operational runbook provides step-by-step procedures for platform administrators, security coordinators, and DevOps engineers managing the Aegis Early-Warning platform.

---

## 1. Monitoring & Health Probes

### Health Endpoints
- **Liveness Probe:** `GET /health` (Checks API server responsiveness)
- **Readiness Probe:** `GET /ready` (Verifies Postgres database and Redis connectivity)
- **Queue Metrics:** `GET /api/v1/alerts/queue/stats` (Requires `ADMIN` bearer token)
- **Circuit Breaker Status:** `GET /api/v1/alerts/circuit-breaker` (Requires `ADMIN` bearer token)

---

## 2. Playbook A: Alerts Stuck in `SENDING` State

### Symptoms:
- An incident has been in `ALERTING` status for more than 15 minutes.
- Some alerts remain with `status: SENDING`.

### Root Cause:
A background worker crashed or lost network connectivity midway through a provider dispatch call before recording `status: SENT`.

### Automated Recovery:
The system's **`AlertReconcilerService`** runs automatically every 5 minutes:
- Detects alerts with `status = 'SENDING'` whose `updatedAt` is older than 15 minutes.
- Resets them to `QUEUED`.
- Re-enqueues them into BullMQ.

### Manual Remediation (if immediate action needed):
1. Execute query to check stuck count:
   ```sql
   SELECT count(*) FROM alerts WHERE status = 'SENDING' AND "updatedAt" < NOW() - INTERVAL '15 minutes';
   ```
2. Manually trigger recovery via the NestJS console or restart the API container:
   ```bash
   docker restart aegis_api
   ```
   *The boot recovery routine automatically scans and re-enqueues all stuck alerts during startup.*

---

## 3. Playbook B: SMS Gateway Outage & Circuit Breaker Tripped

### Symptoms:
- Alert dispatch logs show `[CircuitBreaker] TRIPPED! 10 consecutive SMS dispatch failures.`
- Queue status reports `isPaused: true`.
- Residents are not receiving SMS notifications.

### Root Cause:
The upstream telecom aggregator (Termii, Africa's Talking) is experiencing degraded service, network timeouts, or carrier DND gateway errors. The circuit breaker automatically pauses dispatch to prevent budget waste and carrier flood.

### Step-by-Step Resolution:
1. **Check Aggregator Status:**
   - Log into the Termii dashboard ([termii.com](https://termii.com)) or check their API status page.
   - Verify SMS credit balance and API key validity.
2. **Inspect Current Failure Metrics:**
   ```bash
   curl -X GET http://localhost:4000/api/v1/alerts/circuit-breaker \
     -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
   ```
3. **Wait for Auto-Probe (Half-Open):**
   The circuit breaker automatically attempts a single probe dispatch after 60 seconds (`CIRCUIT_BREAKER_RESET_MS`). If the probe succeeds, the circuit breaker resets itself to `CLOSED` and resumes the queue.
4. **Manual Circuit Breaker Reset:**
   Once provider service is confirmed restored:
   ```bash
   curl -X POST http://localhost:4000/api/v1/alerts/circuit-breaker/reset \
     -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
   ```
5. **Resume Queue Dispatch:**
   ```bash
   curl -X POST http://localhost:4000/api/v1/alerts/queue/resume \
     -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
   ```

---

## 4. Playbook C: Retrying Failed Alerts for an Incident

### Scenario:
An incident finished fanout with status `ALERTS_PARTIALLY_FAILED` due to temporary carrier rejections.

### Resolution:
1. Query failed alerts to inspect carrier rejection reasons:
   ```sql
   SELECT id, "phoneSnapshot", "attempts", "lastError" 
   FROM alerts 
   WHERE "incidentId" = '<INCIDENT_UUID>' AND status = 'FAILED';
   ```
2. Trigger the manual retry endpoint:
   ```bash
   curl -X POST http://localhost:4000/api/v1/incidents/<INCIDENT_UUID>/alerts/retry-failed \
     -H "Authorization: Bearer <OFFICER_OR_ADMIN_JWT_TOKEN>"
   ```
3. **System Behavior:**
   - Resets all `FAILED` alert records for that incident back to `QUEUED`.
   - Resets `attempts` count to 0.
   - Transitions the incident status back to `ALERTING`.
   - Re-enqueues jobs into BullMQ with role-based priority.
   - Writes an `ALERTS_RETRY_TRIGGERED` audit log entry.

---

## 5. Playbook D: False Alert Response & Emergency Cancellation

### Scenario:
An officer mistakenly verified an incident or a false alarm was verified before full facts were established.

### Protocol:
1. **DO NOT delete incident records.** Deleting rows breaks NDPR audit compliance and delivery webhook tracking.
2. **Immediately Resolve with `ALL_CLEAR` Broadcast:**
   Issue a resolution request with the `sendAllClear` flag set to `true`:
   ```bash
   curl -X POST http://localhost:4000/api/v1/incidents/<INCIDENT_UUID>/resolve \
     -H "Authorization: Bearer <OFFICER_OR_ADMIN_JWT_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{
       "notes": "FALSE ALARM: Verified perimeter check confirms false report. Area completely safe.",
       "sendAllClear": true
     }'
   ```
3. **Message Delivered to Residents:**
   The multilingual engine immediately broadcasts the localized `ALL_CLEAR` template to all original recipients:
   - English: `AEGIS UPDATE [INC-XXXXXX]: All clear near <Area> as of <Time>. Security forces have resolved the incident. Stay safe.`
   - Hausa: `SANARWAR AEGIS [INC-XXXXXX]: Komai ya lafa kusa da <Area> da karfe <Time>. Jami'an tsaro sun shawo kan lamarin. Ku kiyaye.`

---

## 6. Playbook E: Emergency Queue Pause (Kill Switch)

If an automated incident spam or unexpected loop is detected:
1. **Trigger Emergency Pause:**
   ```bash
   curl -X POST http://localhost:4000/api/v1/alerts/queue/pause \
     -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
   ```
2. Investigate audit logs for the rogue actor or incident ID:
   ```sql
   SELECT * FROM audit_logs ORDER BY "createdAt" DESC LIMIT 20;
   ```
3. Resume queue once safe:
   ```bash
   curl -X POST http://localhost:4000/api/v1/alerts/queue/resume \
     -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
   ```

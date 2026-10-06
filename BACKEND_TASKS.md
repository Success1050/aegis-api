# AEGIS Backend Implementation Plan & Daily Tasks

> **Phase 1: Manual Early-Warning System — Production Specification**  
> **Tech Stack:** NestJS (TypeScript strict), Prisma ORM, PostgreSQL 15+, BullMQ + Redis, Pino logging, Jest.  
> **Repository:** `aegis-api`

---

## Architecture Overview & Design Principles

1. **Safety-Critical Correctness:** Zero silent alert losses, zero duplicate SMS blasts, fully atomic state transitions with optimistic locking (`version`).
2. **Four-Eyes Verification:** Separation of reporting and verification (`ALLOW_SELF_VERIFY = false` by default).
3. **Auditability:** Append-only structured audit trail for every sensitive action and incident state change.
4. **Resilience & Idempotency:** DB-level unique constraint on `(incidentId, userId, channel)`, transactional enqueueing, idempotent worker retries with exponential backoff and jitter, crash recovery on boot.
5. **Geospatial Efficiency:** Bounding-box prefiltering + Haversine formula on indexed coordinates, modular `GeoService` ready for future PostGIS extension.
6. **Nigerian Localization:** E.164 phone normalization, carrier recognition, GSM-7 vs UCS-2 SMS encoding detection, Hausa diacritic policy, Africa/Lagos (WAT) timestamps.

---

## Daily Task Breakdown

### Day 1: Project Setup, Architecture & Production Foundation (Completed)
- [x] **Architecture & Directory Structure:** Scaffolding complete with modular architecture (`config/`, `common/`, `database/`, and feature modules).
- [x] **TypeScript Strictness:** Enforced `strict: true`, `noImplicitAny: true`, and strict null checks in `tsconfig.json`.
- [x] **Environment Validation:** Implemented Zod-based config validation (`config/env.validation.ts`) to validate all required environment variables at boot.
- [x] **Structured Logging & Correlation IDs:** Configured Pino (`nestjs-pino`) with JSON output and Request-ID middleware (`x-request-id`) injected into all logs and response headers.
- [x] **Global Error Envelope & Filter:** Implemented `AllExceptionsFilter` returning standardized `{ statusCode, error, message, details?, requestId, timestamp }`.
- [x] **Security & Validation:** Integrated `helmet`, strict CORS allowlist, and global `ValidationPipe` (`whitelist: true, forbidNonWhitelisted: true, transform: true`).
- [x] **Swagger / OpenAPI Documentation:** Configured `@nestjs/swagger` with bearer auth, DTO schemas, and exportable OpenAPI spec at `/api/docs`.
- [x] **Health & Readiness Endpoints:** Implemented `/health` (liveness), `/ready` (database and Redis connectivity checks), and root `/` system probe.
- [x] **Infrastructure Scaffolding:** Created `docker-compose.yml` (PostgreSQL 15+, Redis 7+, API), Dockerfile, and `.env.example`.

### Day 2: Prisma Database Schema, Migrations & Role-Adaptive Architecture (Completed)
- [x] **Prisma Schema Definition (`prisma/schema.prisma`):**
  - `User`: UUID, E.164 unique phone, hashed password, coordinates (`Decimal`), `locationUpdatedAt`, `preferredLanguage` (`ENGLISH`, `HAUSA`, `IGBO`, `YORUBA`, `PIDGIN`), `role` (`RESIDENT`, `SECURITY`, `ADMIN`), `zoneId`, `alertsEnabled`, `isActive`, timestamps.
  - `Zone`: UUID, name, `centerLat`, `centerLng`, `radiusMeters` (default 2000), `isActive`.
  - `Incident`: UUID, sequential human-readable `number` (`INC-000001`), `type`, `source` (`MANUAL`), `latitude`, `longitude`, `zoneId`, `description`, `severity`, `status`, `alertRadiusMeters`, reporter/verifier/dismiss fields, `version` for optimistic locking.
  - `Alert`: UUID, `incidentId`, `userId`, `phoneSnapshot`, `language`, `channel` (`SMS`), `message`, `status` (`QUEUED`, `SENDING`, `SENT`, `DELIVERED`, `FAILED`), attempts, `providerMessageId`, unique constraint on `(incidentId, userId, channel)`.
  - `AuditLog`: UUID, `actorId`, `action`, `entityType`, `entityId`, `before`, `after` (JSON), `ip`, `userAgent`, `createdAt`.
  - `IdempotencyRecord`: `key`, `endpoint`, `requestHash`, `statusCode`, `response`, `createdAt`, `expiresAt`.
  - `IncidentSequence`: Atomic sequential counter for human-readable IDs (`INC-000001`).
- [x] **PostGIS Upgrade Architecture Decision Record (`prisma/ADR-POSTGIS.md`):** Documented migration strategy from Haversine/bounding-box to PostGIS polygons and `ST_DWithin`.
- [x] **Role-Adaptive Dashboard Engine (`src/modules/dashboard/`):**
  - `GET /dashboard/admin`: Governance metrics, user language distribution, system health, and blast stats.
  - `GET /dashboard/security`: Tactical operational command metrics, pending verification queue age, people at risk count, and today's delivery status.
  - `GET /dashboard/resident`: Community safety notices (sanitized without coordinates), alert subscription status, and language switch.
  - `GET /dashboard/summary`: Role auto-detector routing callers to the correct view.
- [x] **Seed Engine (`prisma/seed.ts`):**
  - 1 System Admin (`+2348000000001`), 2 Security Officers (`+2348020000001`, `+2348020000002`).
  - Community A Zone (`9.8980, 8.8570`, radius 2000m) & Community B Zone.
  - ~45 realistic Nigerian residents with multilingual representation (Hausa, Pidgin, Yoruba, Igbo, English).
  - Seed users with edge cases: missing coordinates (null), opted-out (`alertsEnabled = false`), inactive, stale location (>90 days), and out-of-range users (5–8 km away).
  - Pre-seeded demo incident `INC-000001` in `PENDING_REVIEW` for the officer verification demo flow.

### Day 3: Authentication, RBAC, Credential Dispatch & Audit Logging (Completed)
- [x] **Password Security:** Secure password hashing (bcryptjs) with robust salt rounds.
- [x] **JWT Engine:** Issue short-lived access tokens (15m) and rotating refresh tokens (7d) with revocation and rotation support using the latest `@nestjs/jwt`.
- [x] **Guards & Decorators:** Implemented global `JwtAuthGuard` (respects `@Public()`), `RolesGuard` (`@Roles('ADMIN', 'SECURITY', 'RESIDENT')`), and `@CurrentUser()` decorator.
- [x] **Dual Identifier Login & Endpoints (`/api/v1/auth`):**
  - `POST /auth/login`: Accepts either normalized Nigerian phone number (`+234...` / `080...`) OR email address, brute-force lockout (5 failed attempts locks for 15 mins), returns access/refresh tokens in JSON, and automatically sets secure `HttpOnly` cookies (`Set-Cookie`).
  - `POST /auth/refresh`: Rotates refresh token (accepts from JSON body or HttpOnly cookie), returning new token pair and updating cookies.
  - `POST /auth/logout`: Revokes active refresh session and clears both `accessToken` and `refreshToken` cookies.
  - `GET /auth/me`: Returns authenticated profile and dashboard metadata via cookie or Bearer header.
- [x] **Secure HttpOnly Cookie Authentication & Dual Support:**
  - Configured `cookie-parser` middleware and cookie setting with `httpOnly: true`, `sameSite: 'lax'`, `secure` (production).
  - Enhanced `JwtAuthGuard` to seamlessly authenticate incoming requests from either `req.cookies.accessToken` (browser Next.js clients) or `Authorization: Bearer <token>` (mobile/CLI).
- [x] **Credential Dispatch Service (`MailService`):**
  - Sends onboarding emails / notices to newly registered residents and security officials containing:
    - User login identifier (email and phone).
    - Initial / temporary password.
    - Portal login website link (`${FRONTEND_URL}/login`).
    - Assigned community zone information.
  - Development fallback logging to terminal when SMTP is not configured.
- [x] **Default Alert Notification Opt-In:**
  - Enforced `alertsEnabled = true` by default for all registered residents and officers.
- [x] **Audit Logging Engine (`src/modules/audit/`):**
  - Append-only `AuditService` logging `USER_LOGIN_SUCCESS`, `USER_LOGIN_FAILED`, `USER_LOGOUT`, `TOKEN_REFRESH`, capturing IP, user-agent, and before/after state diffs.
  - Admin endpoint `GET /api/v1/audit` for security log inspection.
- [x] **PII Masking Utilities:** Automatic redaction of passwords and masking of phone numbers (`+234801•••5678`) in audit logs and API responses.

### Day 4: Geospatial Engine & User Management (Zone & GPS Registration) (Completed)
- [x] **Geospatial Service (`GeoService`) & Dual-Pillar Recipient Selection:**
  - Haversine formula calculation with strict bounding-box prefilter on indexed coordinates.
  - **Pillar 1 (Physical Geofence):** Queries eligible recipients within incident's `alertRadiusMeters`.
  - **Pillar 2 (Zone Community Membership):** Queries all active, alert-enabled residents registered to the incident's home community (`user.zoneId === incident.zoneId`), ensuring residents who are temporarily away at work or travel still receive alerts to warn their families.
  - Strict deduplication by user ID / normalized E.164 phone number.
  - Stale location detection (`locationUpdatedAt > 90 days`).
  - Cap protection check (`MAX_RECIPIENTS_PER_INCIDENT = 2000`) requiring `confirmLargeBlast`.
- [x] **Phone Normalization & Carrier Detection (`phone.util.ts`):**
  - Implemented normalization via `libphonenumber-js` default region `NG`.
  - Accepts `0801...`, `+234...`, `234...`; identifies carrier networks (MTN, Airtel, Glo, 9mobile); formats to strict E.164.
- [x] **Coordinate Validation & Sanity (`coordinate.util.ts`):**
  - Strict range checks (lat ∈ [-90, 90], lng ∈ [-180, 180], reject NaN, `0,0` Null Island).
  - Soft-warn for coordinates outside Nigeria's bounding box (~lat 4–14, lng 2.5–15).
  - Inverted coordinate detection (swapped lat/lng helper).
- [x] **Zone Management (`ZonesService` & `ZonesController`):**
  - `GET /zones` with active membership counts.
  - `GET /zones/:id` zone detail.
  - `POST /zones` and `PATCH /zones/:id` (Admin only) with audit trail logging.
- [x] **User Management & Flexible Registration (GPS + Zone/Address):**
  - Registration endpoint (`POST /users`) supporting two modes:
    1. **Zone-Based Registration:** Assign home `zoneId`, `houseNumber` (compound/house identifier), and `areaDescription` (street/landmark) without requiring GPS coordinates.
    2. **GPS-Enhanced Registration:** Capture client GPS coordinates or map pin in addition to community zone and address.
  - Welcome credentials dispatch with temporary password, email/phone identifier, and website portal link (`${FRONTEND_URL}/login`).
  - Defaults `alertsEnabled: true` for emergency notifications.
  - Paginated user directory with search and role/zone filters (`GET /users`).
  - Soft-delete (`DELETE /users/:id`, sets `isActive = false`).
  - Bulk CSV/JSON import (`POST /users/bulk-import`) supporting rows with or without GPS coordinates, generating credentials, and reporting row-by-row outcomes.

### Day 5: Incident Lifecycle, State Machine & Verification (Completed)
- [x] **Incident State Machine:**
  - Implemented strict transition map: `PENDING_REVIEW` → `VERIFIED` → `ALERTING` → `ALERTS_SENT` / `ALERTS_PARTIALLY_FAILED` → `RESOLVED`; `PENDING_REVIEW` → `DISMISSED`.
  - Atomic race-safe transitions using SQL conditional updates (`WHERE id = ? AND status = ? AND version = ?`) and `version` increment.
  - Throws `409 Conflict` on illegal or concurrent race transitions.
- [x] **Verification Policies & Four-Eyes Principle:**
  - Requires `SECURITY` or `ADMIN` role.
  - Enforced `ALLOW_SELF_VERIFY = false`: blocks reporting officer from verifying their own incident unless an Admin override is explicitly supplied.
  - Mandatory dismissal reason (5–500 characters).
- [x] **Duplicate Incident Detection:**
  - Queries for open incidents within 500m created in the last 30 minutes.
  - Requires explicit `acknowledgeDuplicates: true` flag in payload to proceed.
- [x] **Sequential Incident Numbering:**
  - Implemented atomic sequential number generator (`INC-000001`, `INC-000002`...) backed by `incident_sequences` table with `GREATEST()` max sync.
- [x] **Incident Endpoints (`/api/v1/incidents`):**
  - `POST /incidents`: initializes `PENDING_REVIEW`, never auto-alerts, detects duplicates.
  - `GET /incidents`: paginated search with status, severity, type, and zone filters.
  - `GET /incidents/:id`: full incident detail with verifier and delivery statistics.
  - `GET /incidents/:id/preview-recipients`: dry-run fanout preview with language, role, and physical vs. zone breakdown before verifying.
  - `POST /incidents/:id/verify`: atomic transition to `ALERTING` and bulk insertion of `Alert` rows in a single DB transaction.
  - `POST /incidents/:id/dismiss`: requires mandatory dismissal reason (5–500 chars).
  - `POST /incidents/:id/resolve`: optional `sendAllClear` flag.
- [x] **Auto-Expiry Cron (`AutoExpiryService`):**
  - Scheduled `@Cron` task running every minute, expiring stale `PENDING_REVIEW` incidents older than 60m to `DISMISSED` with reason `AUTO_EXPIRED` and audit logging.
- [x] **Idempotency Engine (`IdempotencyService`):**
  - Evaluates `Idempotency-Key` headers on mutating endpoints, returning cached responses (`X-Cache: HIT`) on replay.

### Day 6: SMS Service, Multilingual Templates & Encoding
- [ ] **SMS Encoding Engine (`sms-encoding.util.ts`):**
  - Character set detection: GSM-7 (160 chars/segment) vs UCS-2 (70 chars/segment).
  - Calculate segment count and warn on cost blow-ups.
  - `normalizeForSms()` utility: strip emojis, replace smart quotes.
  - Hausa diacritic policy (`PRESERVE_DIACRITICS = true/false`).
- [ ] **Multilingual Message Templates (`alerts/templates/`):**
  - Typed templates for `ALERT_VERIFIED_INCIDENT` and `ALL_CLEAR` in English, Hausa, Igbo, Yoruba, Pidgin.
  - Flag Igbo, Yoruba, Pidgin as `status: 'NEEDS_NATIVE_REVIEW'`.
  - Fallback chain: requested language → English. Fail loudly on unreplaced placeholders.
  - Area name only; sanitize and prevent coordinate leaking to residents.
- [ ] **SMS Providers:**
  - `SmsProvider` interface (`send(...)`).
  - `FakeSmsProvider`: ASCII console output, persistent record, failure rate simulation (`FAKE_SMS_FAIL_RATE`), latency simulation (`FAKE_SMS_LATENCY_MS`).
  - `RealSmsProvider`: Stubbed adapter for Nigerian SMS aggregators (Termii, Africa's Talking) with configuration hooks.
- [ ] **Delivery Receipt Webhook:**
  - `POST /webhooks/sms-delivery` with HMAC signature validation and replay protection.

### Day 7: Alert Engine, Queue Worker, Resilience & Reconciler
- [ ] **Transactional Alert Fanout:**
  - In a single DB transaction: transition incident to `ALERTING`, bulk insert Alert rows (`QUEUED`) with `skipDuplicates`, enqueue BullMQ jobs.
- [ ] **BullMQ Alert Worker:**
  - Atomic transition: `QUEUED` → `SENDING` (exit if 0 rows updated to prevent double send).
  - Call `SmsProvider.send()`, record `providerMessageId`, update to `SENT`.
  - Failure handling: increment `attempts`, log `lastError`, exponential backoff with jitter (5 retries: 5s, 20s, 1m, 5m, 15m). Max retries → `FAILED`.
  - Dispatch priority: `SECURITY` alerts before `RESIDENT`, higher severity first.
  - Provider rate limiting / throttling (concurrency & TPS caps).
- [ ] **Incident Finalization:**
  - Atomic "last one out" check: transition incident to `ALERTS_SENT` or `ALERTS_PARTIALLY_FAILED`, record `alertsCompletedAt`, write audit log.
- [ ] **Recovery & Reconciler:**
  - Boot recovery routine: detect incidents stuck in `ALERTING` and re-enqueue `QUEUED` / stale `SENDING` alerts.
  - Periodic reconciler: flag alerts stuck in `SENDING` for > 15 minutes.
  - Circuit breaker hook: pause queue and notify admin on provider outages.
  - `POST /incidents/:id/alerts/retry-failed`: manual retry for failed alerts.

### Day 8: Automated Testing, Hardening & Production Documentation
- [ ] **Unit Test Suite:**
  - Haversine calculation against known distances & boundary edge cases.
  - Phone normalization across all Nigerian carrier formats.
  - GSM-7 / UCS-2 character classification & segment calculation.
  - Template rendering across all 5 languages.
  - Risk calculation function (`risk.util.ts`).
  - State machine transition matrix (all valid and invalid transitions).
- [ ] **Integration & E2E Test Suite (Real Postgres & Redis):**
  - Full happy path flow (create → preview → verify → fanout → delivery).
  - 10 parallel verify requests race test (assert exactly one fanout of 41 alerts).
  - Idempotency key replay test.
  - Auto-expiry of stale pending incidents.
  - Delivery webhook HMAC signature verification.
  - Zero-recipient and large-blast guard tests.
- [ ] **Documentation Deliverables:**
  - `README.md` (quickstart, env vars, demo script).
  - `ARCHITECTURE.md` (system diagrams, state machine, PostGIS upgrade path, Phase 2 camera/AI ingestion hooks).
  - `ASSUMPTIONS.md` (documented design decisions).
  - `RUNBOOK.md` (operational runbook for stuck alerts, provider outages, false alert response).
  - OpenAPI JSON/YAML export.

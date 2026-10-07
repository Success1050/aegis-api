# AEGIS — Assumptions & Architectural Decisions

This document records all assumptions, default decisions, and architectural tradeoffs made for **Aegis Phase 1: Manual Early-Warning System**, in accordance with the specification.

---

## 1. Environment & Architecture Assumptions

1. **Workspace Separation:**  
   The project is structured into two companion workspaces:
   - `aegis-api`: NestJS backend API, BullMQ worker, Prisma ORM, and database scripts.
   - `aegis`: Next.js frontend dashboard (App Router), Tailwind CSS.
   Shared contracts and types are mirrored in TypeScript strict mode across both projects.

2. **Database & Timezone:**  
   - PostgreSQL 15+ is the source of truth.
   - All timestamps are captured, persisted, and calculated in **UTC**.
   - All client-facing timestamps are formatted and localized to **Africa/Lagos (WAT, UTC+1)**.

3. **Queue Architecture (BullMQ + Redis):**  
   - BullMQ backed by Redis is used for all alert dispatches.
   - Jobs are enqueued in small batches inside a database transaction alongside the creation of `Alert` records (`status = 'QUEUED'`).
   - If Redis is unavailable during verify, the transaction rolls back cleanly, preventing dangling alerts without background dispatchers.

---

## 2. Geospatial Assumptions & PostGIS Migration Path

1. **Phase 1 Coordinate Representation:**  
   - Coordinates are stored as standard floating-point / Decimal degrees (`latitude`, `longitude`).
   - Spatial indexing uses composite B-tree indexes on `(latitude, longitude)`.
   - Bounding-box prefiltering calculates minimum and maximum latitudes/longitudes before evaluating the spherical **Haversine formula**.
   - Inclusive boundary (`distanceMeters <= radiusMeters`) is strictly applied.

2. **Antimeridian & Polar Extremes:**  
   - Aegis Phase 1 is designed for Nigerian communities (`lat 4.0–14.0`, `lng 2.5–15.0`). Coordinates outside this range trigger warnings. Polar and antimeridian wrap-arounds are explicitly out of scope for Phase 1.

3. **PostGIS Upgrade Path (Phase 2):**  
   - The spatial interface is abstracted behind `GeoService`.
   - Migration path: Introduce `geometry(Point, 4326)` columns, populate via PostGIS migration, and replace Haversine math with `ST_DWithin(geom::geography, ST_MakePoint(lng, lat)::geography, radiusMeters)` without changing the public `GeoService` signature.

---

## 3. Incident State Machine & Concurrency

1. **Optimistic Locking & Race Safety:**  
   - The `Incident` table contains a `version` integer column incremented on every status transition.
   - Status changes execute conditional updates (`UPDATE ... WHERE id = ? AND version = ? AND status = ?`). If 0 rows are affected, a `409 Conflict` exception is thrown immediately.
   - Multiple security officers verifying or dismissing simultaneously cannot double-dispatch or corrupt state.

2. **Four-Eyes Principle (`ALLOW_SELF_VERIFY`):**  
   - By default, `ALLOW_SELF_VERIFY = false`. A security officer cannot verify an incident they reported.
   - Admins can override this policy for small teams, recording `selfVerified: true` in the audit log.

3. **Auto-Expiry Window:**  
   - Stale reports in `PENDING_REVIEW` auto-expire after **60 minutes** (`INCIDENT_EXPIRY_MINUTES = 60`) into `DISMISSED` with reason `AUTO_EXPIRED`.

---

## 4. SMS Delivery & Encoding Tradeoffs

1. **Provider Abstraction:**  
   - Dev/test environments default to `SMS_PROVIDER=fake` (`FakeSmsProvider`), which outputs ASCII terminal logs and persists delivery records in memory/DB.
   - Production connects via `RealSmsProvider` adapter to Nigerian aggregators (Termii, Africa's Talking).

2. **GSM-7 vs UCS-2 Diacritics:**  
   - SMS standard limits single messages to 160 characters in GSM-7, or 70 characters in UCS-2.
   - Hausa special characters (ɓ, ɗ, ƙ) and emojis force UCS-2, tripling SMS segments and cost.
   - Decision: `PRESERVE_DIACRITICS` defaults to `false` (transliterating to b, d, k) to safeguard emergency budgets, but can be enabled via config for linguistically strict deployments.
   - Emojis are stripped from resident alert text by `normalizeForSms()`.

3. **Do-Not-Disturb (DND) / NCC Compliance:**  
   - All alerts require a pre-registered transactional Alpha Sender ID (`AEGIS-ALERT`) to bypass Nigerian NCC promotional DND restrictions.

---

## 5. Security & Privacy Compliance (NDPR)

1. **PII Masking:**  
   - Phone numbers are masked in all logs and general UI views (`+234801•••5678`).
   - Only authorized officers/admins during incident inspection can view full details.

2. **Append-Only Auditing:**  
   - The `AuditLog` table contains no update or delete endpoints. Every state modification captures the actor, action, timestamp, IP, and JSON delta (`before`/`after`).

---

## 6. Registration & Alert Fan-Out Models (Zone-Based vs. GPS Proximity)

1. **Flexible Registration Options:**  
   - Field registration by security officers and admins supports both **GPS-enabled** and **Zone-only** modes.
   - For communities where smartphone GPS is unavailable or residents are registered at local town halls, registration relies on the resident's home `zoneId`, along with optional `houseNumber` (compound/house identifier) and `areaDescription` (street, quarter, or landmark).
   - Residents can be registered without requiring immediate GPS coordinates (`latitude` and `longitude` remain nullable).

2. **Dual-Pillar Recipient Selection Engine:**  
   - When an incident is verified in a zone, alert fan-out combines two complementary groups:
     1. **Physical Geofence:** Users whose recorded coordinates are within `alertRadiusMeters` of the incident.
     2. **Community Membership:** All active, alert-enabled residents registered to the incident's `zoneId` (`user.zoneId === incident.zoneId`), even if they are physically traveling, working outside the perimeter, or have no GPS coordinates.
   - **Rationale:** If a threat occurs near a resident's home compound, the resident must receive the alert to notify family members, children, or elderly relatives remaining in the compound.
   - **Deduplication:** The recipient list is strictly deduplicated by normalized E.164 phone number.

---

## 7. User Onboarding, Credential Dispatch & Notification Defaults

1. **Automated Credential Dispatch on Registration:**  
   - When a security officer, admin, or resident account is created, the system securely generates or accepts their password.
   - If an email address is provided, a welcome message is dispatched containing:
     - Their login identifier (email address and E.164 phone number)
     - Their initial/temporary password
     - Direct portal login link (`${FRONTEND_URL}/login`)
     - Assigned community ward/zone
   - In environments where SMTP credentials are not configured or in dev mode, the system safely falls back to formatted terminal output and audit logging without crashing.

2. **Default Alert Notification Opt-In:**  
   - By default, `alertsEnabled = true` for every newly registered resident and security official.
   - Residents remain subscribed to early-warning emergency broadcasts by default, with opt-out supported via preference settings or NCC DND guidelines.

3. **Dual Login Identifiers:**  
   - The authentication service natively accepts either an **E.164 / local Nigerian phone number** (`+23480...` or `080...`) OR an **email address** (`user@example.com`).

4. **HttpOnly Cookie & Dual-Delivery Authentication:**  
   - To provide the highest standard of web application security (immunity against XSS token exfiltration) while preserving compatibility with mobile apps and CLI consumers:
     - On `/auth/login` and `/auth/refresh`, the server automatically sets `accessToken` (15m expiry) and `refreshToken` (7d expiry) as **`HttpOnly`, `SameSite=Lax` cookies** (with `Secure: true` in production) via `res.cookie()`.
     - The server also returns the tokens in the JSON response body for native mobile clients.
     - `JwtAuthGuard` checks the `HttpOnly` cookie first, falling back gracefully to the `Authorization: Bearer <token>` header.
     - On `/auth/logout`, the server clears both cookies and revokes the active refresh session in the backend.




---

## 8. Multilingual Templates & Coordinate Protection

1. **Native Review Status Policy:**  
   - English and Hausa are marked `APPROVED`.
   - Igbo, Yoruba, and Pidgin are marked `NEEDS_NATIVE_REVIEW`.
   - By default (`ALLOW_UNREVIEWED_TEMPLATES=false`), requests for unreviewed translations safely fall back to English to prevent mistranslations during high-stress emergencies.
   - Fail-loud validation: if any placeholder (`{incidentNumber}`, `{type}`, `{areaName}`, `{time}`) cannot be resolved, template rendering throws immediately rather than broadcasting broken messages.

2. **Zero Coordinate Leakage Guard:**  
   - Raw GPS coordinates (e.g. `9.0765, 7.3985` or `lat 9.07, lng 7.39`) are strictly forbidden in resident alert messages.
   - Alerts only use human-readable landmark or community zone names (`areaName`). Any attempt to embed numeric coordinates triggers an immediate security validation exception.

---

## 9. BullMQ Queue, Priority Scheduling & Resilience

1. **Priority Hierarchy:**  
   - `SECURITY` alerts take precedence over `RESIDENT` alerts.
   - Within each role group, higher severity (`CRITICAL` > `HIGH` > `MEDIUM` > `LOW`) alerts are processed first.
   - Implemented via dynamic BullMQ job priority calculation: `priority = (role === 'SECURITY' ? 10 : 20) + severityOffset`.

2. **Transparent In-Memory Priority Fallback:**  
   - If Redis is offline or undergoing maintenance, the alert queue system seamlessly falls back to an in-memory priority queue engine so emergency dispatches and local development never crash.
   - When Redis is available, BullMQ executes with a concurrency of 10 and a rate limiter of 50 TPS.

3. **Circuit Breaker Pattern:**  
   - Tracks consecutive carrier dispatch failures.
   - If 10 consecutive failures occur, the circuit breaker transitions to `OPEN` and pauses the dispatch queue, preventing carrier spam and preserving operational SMS credits.
   - Auto-tests provider health with a probe dispatch after 60 seconds (`HALF_OPEN`).

4. **Self-Healing Reconciler & Boot Recovery:**  
   - Reconciler cron runs every 5 minutes: resets stranded alerts stuck in `SENDING` for $>15$ minutes back to `QUEUED` and finalizes stuck incidents.
   - System boot hook scans and re-enqueues all non-terminal alerts on server startup.

---

## 10. Automated Testing & Package Integrity

1. **Zero Package Downgrade Policy:**  
   - Modern dependencies (`@nestjs/jwt` v12, `@nestjs/core` v11, `bullmq` v5, Prisma v6) are preserved without downgrading.
   - ESM-only dependencies (e.g. `@nestjs/swagger`) are isolated so unit tests and builds run with zero bundle errors.

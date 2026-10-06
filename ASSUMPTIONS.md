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


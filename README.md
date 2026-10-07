# 🛡️ AEGIS API — Community Early-Warning System Backend

> Production-grade early-warning alert delivery engine and incident management platform tailored for Nigerian communities.

---

## 📋 Overview

**Aegis** is an automated community safety platform that enables verified security incident reporting and high-speed multilingual SMS broadcast fan-out.

### Core Capabilities:
- **Dual-Pillar Recipient Selection:** Dispatches alerts to residents physically present within an incident blast radius (Haversine GPS geofence) **AND** to registered members of the affected community zone (`user.zoneId === incident.zoneId`), ensuring residents traveling or working away from home receive notifications to warn family members.
- **Multilingual Messaging Engine:** Localizes emergency alerts into 5 languages (`ENGLISH`, `HAUSA`, `IGBO`, `YORUBA`, `PIDGIN`) with Hausa diacritics transliteration policy (`PRESERVE_DIACRITICS`) to prevent UCS-2 cost blowups.
- **Four-Eyes Verification:** Strict finite state machine requiring two security officials to independently report and verify incidents before dispatching emergency broadcasts.
- **BullMQ Queue & Worker:** 10-worker concurrency with 50 TPS telecom rate-limiting, role-based priority scheduling (`SECURITY` alerts dispatch before `RESIDENT` alerts), and exponential backoff retry.
- **Resilience Engine:** Circuit breaker tripping on 10 consecutive gateway failures, periodic reconciler cron self-healing stuck alerts, and automatic recovery on system boot.
- **Zero Coordinate Leakage Guard:** Cryptographic regex filtering prevents raw GPS coordinates from being transmitted in resident alert text, enforcing sanitized landmark and ward names.
- **HttpOnly Cookie Authentication:** Dual delivery of access (15m) and refresh (7d) tokens via secure `HttpOnly` cookies and JSON response bodies.

---

## 🚀 Quickstart

### Prerequisites
- Node.js 20+ (Node 24 recommended)
- PostgreSQL 15+
- Redis 7+ (optional in local development; system includes transparent in-memory priority queue fallback)

### 1. Installation
```bash
git clone <repo-url> aegis-api
cd aegis-api
npm install
```

### 2. Environment Configuration
Create a `.env` file in the project root:
```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:password@localhost:5432/aegis_db
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

JWT_ACCESS_SECRET=aegis-dev-super-secure-access-token-secret-key-32-chars!
JWT_REFRESH_SECRET=aegis-dev-super-secure-refresh-token-secret-key-32-chars!
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

SMS_PROVIDER=fake
SMS_SENDER_ID=AEGIS
FAKE_SMS_FAIL_RATE=0.0
FAKE_SMS_LATENCY_MS=50
PRESERVE_DIACRITICS=false

ALLOW_SELF_VERIFY=false
ALLOW_UNREVIEWED_TEMPLATES=false
INCIDENT_EXPIRY_MINUTES=60
MAX_RECIPIENTS_PER_INCIDENT=2000

WEBHOOK_HMAC_SECRET=aegis-webhook-dev-secret-key-signature
```

### 3. Database Migration & Seeding
```bash
# Generate Prisma Client
npm run prisma:generate

# Run Database Migrations
npm run prisma:migrate

# Seed Demo Zones, Users, and Demo Incidents
npm run seed
```

### 4. Running the Application
```bash
# Development (with watch mode)
npm run start:dev

# Production Build & Execution
npm run build
npm run start:prod
```

API will be live at `http://localhost:4000/api/v1`
Interactive Swagger Documentation: `http://localhost:4000/api/docs`
Health Probes: `http://localhost:4000/health` and `http://localhost:4000/ready`

---

## 👥 Seed Accounts

| Role | Phone | Email | Default Password | Zone |
| :--- | :--- | :--- | :--- | :--- |
| **ADMIN** | `+2348000000001` | `admin@aegis.ng` | `AdminSecure2026!` | Global System Admin |
| **SECURITY** | `+2348020000001` | `officer1@aegis.ng` | `OfficerSecure2026!` | Community A (North Ward) |
| **SECURITY** | `+2348020000002` | `officer2@aegis.ng` | `OfficerSecure2026!` | Community A (North Ward) |
| **RESIDENT** | `+2348030000001` | `resident1@aegis.ng` | `ResidentSecure2026!` | Community A (Hausa) |
| **RESIDENT** | `+2348030000004` | `resident4@aegis.ng` | `ResidentSecure2026!` | Community A (Yoruba) |
| **RESIDENT** | `+2348030000007` | `resident7@aegis.ng` | `ResidentSecure2026!` | Community A (Igbo) |

*Note: Database seed includes 45+ residents distributed across Community A and Community B.*

---

## 🧪 Automated Testing

### 1. Jest Unit Test Suite
Runs 60+ unit tests across Haversine math, Nigerian carrier normalization, GSM-7/UCS-2 character detection, risk scoring, template rendering, and state machine transition rules:
```bash
npm run test
```

### 2. End-to-End & Integration Test Suites
Executes real PostgreSQL and Redis integration tests:
```bash
# Day 5 Incident Lifecycle & State Machine Tests
npx ts-node test/test-day5.ts

# Day 6 SMS Encoding & HMAC Webhook Tests
npx ts-node test/test-day6.ts

# Day 7 BullMQ Worker, Priority Dispatch & Reconciler Tests
npx ts-node test/test-day7.ts

# Day 8 Full End-to-End Lifecycle & Concurrency Race Suite
npx ts-node test/test-day8-e2e.ts
```

---

## 📖 Documentation & Runbooks

- [`ARCHITECTURE.md`](file:///c:/Users/Dell/Desktop/aegis-api/ARCHITECTURE.md): Complete architecture diagrams, finite state machine, PostGIS migration path, and Phase 2 extension points.
- [`RUNBOOK.md`](file:///c:/Users/Dell/Desktop/aegis-api/RUNBOOK.md): SRE and operator runbook for stuck alert triage, provider outages, circuit breaker resets, and false alarm procedures.
- [`ASSUMPTIONS.md`](file:///c:/Users/Dell/Desktop/aegis-api/ASSUMPTIONS.md): Comprehensive log of all architectural tradeoffs, design choices, and compliance models.
- [`openapi.json`](file:///c:/Users/Dell/Desktop/aegis-api/openapi.json): Standalone OpenAPI specification export.

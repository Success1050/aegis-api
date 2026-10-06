-- CreateEnum
CREATE TYPE "Role" AS ENUM ('RESIDENT', 'SECURITY', 'ADMIN');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('ENGLISH', 'HAUSA', 'IGBO', 'YORUBA', 'PIDGIN');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('POSSIBLE_INTRUSION', 'SUSPICIOUS_PERSON', 'SUSPICIOUS_VEHICLE', 'FIRE', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentSource" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('PENDING_REVIEW', 'VERIFIED', 'ALERTING', 'ALERTS_SENT', 'ALERTS_PARTIALLY_FAILED', 'DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('SMS');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "locationUpdatedAt" TIMESTAMP(3),
    "preferredLanguage" "Language" NOT NULL DEFAULT 'ENGLISH',
    "role" "Role" NOT NULL DEFAULT 'RESIDENT',
    "zoneId" UUID,
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "centerLat" DECIMAL(10,7) NOT NULL,
    "centerLng" DECIMAL(10,7) NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 2000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "source" "IncidentSource" NOT NULL DEFAULT 'MANUAL',
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "zoneId" UUID,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "alertRadiusMeters" INTEGER NOT NULL,
    "reportedById" UUID NOT NULL,
    "verifiedById" UUID,
    "dismissedById" UUID,
    "dismissReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "alertsCompletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "phoneSnapshot" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "channel" "AlertChannel" NOT NULL DEFAULT 'SMS',
    "message" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_sequences" (
    "id" SERIAL NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_isActive_alertsEnabled_idx" ON "users"("isActive", "alertsEnabled");

-- CreateIndex
CREATE INDEX "users_latitude_longitude_idx" ON "users"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_number_key" ON "incidents"("number");

-- CreateIndex
CREATE INDEX "incidents_status_createdAt_idx" ON "incidents"("status", "createdAt");

-- CreateIndex
CREATE INDEX "incidents_type_createdAt_idx" ON "incidents"("type", "createdAt");

-- CreateIndex
CREATE INDEX "incidents_zoneId_idx" ON "incidents"("zoneId");

-- CreateIndex
CREATE INDEX "alerts_incidentId_status_idx" ON "alerts"("incidentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_incidentId_userId_channel_key" ON "alerts"("incidentId", "userId", "channel");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

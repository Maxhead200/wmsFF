-- FIX: additive tablet ledger, separate from payroll totals and warehouse operations.
CREATE TABLE "AttendanceDevice" (
  "id" TEXT PRIMARY KEY, "warehouseId" TEXT NOT NULL, "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "name" TEXT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3)
);
CREATE TABLE "AttendanceCode" (
  "hash" TEXT PRIMARY KEY, "warehouseId" TEXT NOT NULL, "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3)
);
CREATE TABLE "AttendanceEvent" (
  "id" TEXT PRIMARY KEY, "deviceId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL, "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "kind" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "data" JSONB NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL, "reason" TEXT NOT NULL, "result" JSONB NOT NULL,
  "acknowledged" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX "AttendanceEvent_deviceId_acknowledged_idx" ON "AttendanceEvent"("deviceId", "acknowledged");
CREATE INDEX "AttendanceEvent_warehouseId_receivedAt_idx" ON "AttendanceEvent"("warehouseId", "receivedAt");
CREATE TABLE "AttendancePhotoRequest" (
  "id" TEXT PRIMARY KEY, "eventId" TEXT NOT NULL UNIQUE, "deviceId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL, "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "photo" BYTEA
);
CREATE INDEX "AttendancePhotoRequest_deviceId_status_idx" ON "AttendancePhotoRequest"("deviceId", "status");
CREATE SEQUENCE "AttendanceRevision";

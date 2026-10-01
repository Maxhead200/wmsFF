-- FIX: additive migration; existing shifts and confirmed charges retain their meaning.
CREATE TABLE "PayrollBreak" (id TEXT PRIMARY KEY, "shiftId" TEXT NOT NULL REFERENCES "PayrollShift"(id) ON DELETE RESTRICT, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3), CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"));
CREATE INDEX "PayrollBreak_shiftId_startsAt_idx" ON "PayrollBreak"("shiftId", "startsAt");
CREATE UNIQUE INDEX "PayrollBreak_one_open" ON "PayrollBreak"("shiftId") WHERE "endsAt" IS NULL;
ALTER TABLE "PayrollHandling" ADD COLUMN "boxCount" INTEGER NOT NULL DEFAULT 0 CHECK ("boxCount" >= 0), ADD COLUMN "bagCount" INTEGER NOT NULL DEFAULT 0 CHECK ("bagCount" >= 0), ADD COLUMN "rollCount" INTEGER NOT NULL DEFAULT 0 CHECK ("rollCount" >= 0), ADD COLUMN "unitRateKopecks" INTEGER;

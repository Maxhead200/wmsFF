-- FIX: additive, preserves every original shift and the automatic lunch default.
ALTER TABLE "PayrollShift" ADD COLUMN "cancelledAt" TIMESTAMP(3);
CREATE TABLE "PayrollWorkDay" (
  "employeeId" TEXT NOT NULL REFERENCES "PayrollEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "workDate" TEXT NOT NULL,
  "lunchMinutes" INTEGER CHECK ("lunchMinutes" >= 0),
  PRIMARY KEY ("employeeId", "workDate")
);

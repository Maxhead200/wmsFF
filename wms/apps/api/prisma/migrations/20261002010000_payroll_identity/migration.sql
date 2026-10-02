-- FIX: reversible identity links only; no historical earnings are moved.
ALTER TABLE "PayrollEmployee" ADD COLUMN "payrollPrimaryId" TEXT REFERENCES "PayrollEmployee"(id) ON DELETE RESTRICT;
CREATE INDEX "PayrollEmployee_payrollPrimaryId_idx" ON "PayrollEmployee"("payrollPrimaryId");

CREATE TYPE "EmployeeCompensationType" AS ENUM ('DAILY', 'CACHE');
CREATE TYPE "FinanceCategoryType" AS ENUM ('INCOME', 'EXPENSE');

ALTER TABLE "Event" ADD COLUMN "responsibleName" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "externalSource" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "LedgerEntry" ADD COLUMN "externalReference" TEXT;
ALTER TABLE "Deposit" ADD COLUMN "transportResponsible" TEXT;

CREATE TABLE "FinanceCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "FinanceCategoryType" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeCompensation" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "eventId" TEXT,
  "type" "EmployeeCompensationType" NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "status" "ExpenseStatus" NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeCompensation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeCompensation_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "EmployeeCompensation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeCompensation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeCompensation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EmployeePayment" (
  "id" TEXT NOT NULL,
  "compensationId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "EmployeePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeePayment_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "EmployeePayment_compensationId_fkey" FOREIGN KEY ("compensationId") REFERENCES "EmployeeCompensation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeePayment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EmployeeCompensation_idempotencyKey_key" ON "EmployeeCompensation"("idempotencyKey");
CREATE UNIQUE INDEX "LedgerEntry_externalSource_externalReference_key" ON "LedgerEntry"("externalSource", "externalReference");
CREATE INDEX "EmployeeCompensation_employeeId_dueDate_idx" ON "EmployeeCompensation"("employeeId", "dueDate");
CREATE INDEX "EmployeeCompensation_status_dueDate_idx" ON "EmployeeCompensation"("status", "dueDate");
CREATE INDEX "EmployeeCompensation_eventId_dueDate_idx" ON "EmployeeCompensation"("eventId", "dueDate");
CREATE UNIQUE INDEX "EmployeePayment_entryId_key" ON "EmployeePayment"("entryId");
CREATE INDEX "EmployeePayment_compensationId_paidAt_idx" ON "EmployeePayment"("compensationId", "paidAt");
CREATE UNIQUE INDEX "FinanceCategory_name_type_key" ON "FinanceCategory"("name", "type");
CREATE INDEX "FinanceCategory_type_active_idx" ON "FinanceCategory"("type", "active");

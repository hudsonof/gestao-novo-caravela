CREATE TABLE "CashRegisterShift" (
    "id" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "employeeId" TEXT,
    "openedById" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "openingFloat" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    CONSTRAINT "CashRegisterShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashRegisterWithdrawal" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "observation" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashRegisterWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashRegisterClosing" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "cashSales" DECIMAL(18,2) NOT NULL,
    "debitSales" DECIMAL(18,2) NOT NULL,
    "creditSales" DECIMAL(18,2) NOT NULL,
    "pixSales" DECIMAL(18,2) NOT NULL,
    "countedCash" DECIMAL(18,2) NOT NULL,
    "expectedCash" DECIMAL(18,2) NOT NULL,
    "difference" DECIMAL(18,2) NOT NULL,
    "justification" TEXT,
    "closedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashRegisterClosing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashRegisterShift_idempotencyKey_key" ON "CashRegisterShift"("idempotencyKey");
CREATE UNIQUE INDEX "CashRegisterShift_one_open_per_register" ON "CashRegisterShift"("registerId") WHERE "status" = 'OPEN';
CREATE INDEX "CashRegisterShift_registerId_status_idx" ON "CashRegisterShift"("registerId", "status");
CREATE INDEX "CashRegisterShift_employeeId_openedAt_idx" ON "CashRegisterShift"("employeeId", "openedAt");
CREATE UNIQUE INDEX "CashRegisterWithdrawal_idempotencyKey_key" ON "CashRegisterWithdrawal"("idempotencyKey");
CREATE INDEX "CashRegisterWithdrawal_shiftId_createdAt_idx" ON "CashRegisterWithdrawal"("shiftId", "createdAt");
CREATE UNIQUE INDEX "CashRegisterClosing_shiftId_key" ON "CashRegisterClosing"("shiftId");
CREATE UNIQUE INDEX "CashRegisterClosing_idempotencyKey_key" ON "CashRegisterClosing"("idempotencyKey");

ALTER TABLE "CashRegisterShift" ADD CONSTRAINT "CashRegisterShift_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashRegisterShift" ADD CONSTRAINT "CashRegisterShift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashRegisterShift" ADD CONSTRAINT "CashRegisterShift_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashRegisterWithdrawal" ADD CONSTRAINT "CashRegisterWithdrawal_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashRegisterShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashRegisterWithdrawal" ADD CONSTRAINT "CashRegisterWithdrawal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashRegisterClosing" ADD CONSTRAINT "CashRegisterClosing_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashRegisterShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashRegisterClosing" ADD CONSTRAINT "CashRegisterClosing_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

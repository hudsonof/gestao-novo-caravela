CREATE TYPE "PosChannel" AS ENUM ('TICKETS', 'TABLES', 'BAR', 'WAITER');
CREATE TYPE "PosOrderStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');

CREATE TABLE "PosTable" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PosTable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PosTable_name_key" ON "PosTable"("name");

CREATE TABLE "PosDevice" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "profile" "PosChannel" NOT NULL,
  "cashRegisterId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "PosDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PosDevice_tokenHash_key" ON "PosDevice"("tokenHash");
CREATE INDEX "PosDevice_profile_active_idx" ON "PosDevice"("profile", "active");
CREATE INDEX "PosDevice_cashRegisterId_active_idx" ON "PosDevice"("cashRegisterId", "active");
ALTER TABLE "PosDevice" ADD CONSTRAINT "PosDevice_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosDevice" ADD CONSTRAINT "PosDevice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PosOrder" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "channel" "PosChannel" NOT NULL,
  "commandCode" TEXT NOT NULL,
  "tableId" TEXT,
  "tableNameSnapshot" TEXT,
  "waiterEmployeeId" TEXT,
  "operatorEmployeeId" TEXT,
  "status" "PosOrderStatus" NOT NULL DEFAULT 'OPEN',
  "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  CONSTRAINT "PosOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PosOrder_idempotencyKey_key" ON "PosOrder"("idempotencyKey");
CREATE INDEX "PosOrder_eventId_status_openedAt_idx" ON "PosOrder"("eventId", "status", "openedAt");
CREATE INDEX "PosOrder_sessionId_status_idx" ON "PosOrder"("sessionId", "status");
CREATE INDEX "PosOrder_channel_status_idx" ON "PosOrder"("channel", "status");
CREATE INDEX "PosOrder_commandCode_eventId_idx" ON "PosOrder"("commandCode", "eventId");
ALTER TABLE "PosOrder" ADD CONSTRAINT "PosOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosOrder" ADD CONSTRAINT "PosOrder_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosOrder" ADD CONSTRAINT "PosOrder_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PosDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosOrder" ADD CONSTRAINT "PosOrder_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PosTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosOrder" ADD CONSTRAINT "PosOrder_waiterEmployeeId_fkey" FOREIGN KEY ("waiterEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosOrder" ADD CONSTRAINT "PosOrder_operatorEmployeeId_fkey" FOREIGN KEY ("operatorEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PosOrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(18,2) NOT NULL,
  "lineTotal" DECIMAL(18,2) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosOrderItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PosOrderItem_idempotencyKey_key" ON "PosOrderItem"("idempotencyKey");
CREATE INDEX "PosOrderItem_orderId_idx" ON "PosOrderItem"("orderId");
ALTER TABLE "PosOrderItem" ADD CONSTRAINT "PosOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PosOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosOrderItem" ADD CONSTRAINT "PosOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PosProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PosPayment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "ledgerEntryId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PosPayment_ledgerEntryId_key" ON "PosPayment"("ledgerEntryId");
CREATE UNIQUE INDEX "PosPayment_idempotencyKey_key" ON "PosPayment"("idempotencyKey");
CREATE INDEX "PosPayment_orderId_createdAt_idx" ON "PosPayment"("orderId", "createdAt");
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PosOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "UserRole" ADD VALUE 'POS_TICKETS';
ALTER TYPE "UserRole" ADD VALUE 'POS_TABLES';
ALTER TYPE "UserRole" ADD VALUE 'POS_BAR';
ALTER TYPE "UserRole" ADD VALUE 'POS_WAITER';

ALTER TABLE "User" ADD COLUMN "posCashRegisterId" TEXT;
CREATE INDEX "User_posCashRegisterId_idx" ON "User"("posCashRegisterId");
ALTER TABLE "User" ADD CONSTRAINT "User_posCashRegisterId_fkey"
  FOREIGN KEY ("posCashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PosOrder" ALTER COLUMN "deviceId" DROP NOT NULL;
ALTER TABLE "PosOrder" ADD COLUMN "operatorUserId" TEXT;
CREATE INDEX "PosOrder_operatorUserId_openedAt_idx" ON "PosOrder"("operatorUserId", "openedAt");
ALTER TABLE "PosOrder" ADD CONSTRAINT "PosOrder_operatorUserId_fkey"
  FOREIGN KEY ("operatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

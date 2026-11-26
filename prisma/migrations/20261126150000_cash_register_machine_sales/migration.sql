ALTER TABLE "CashRegisterClosing"
ADD COLUMN "machineSales" DECIMAL(18,2) NOT NULL DEFAULT 0;

UPDATE "CashRegisterClosing"
SET "machineSales" = COALESCE("debitSales", 0) + COALESCE("creditSales", 0) + COALESCE("pixSales", 0);

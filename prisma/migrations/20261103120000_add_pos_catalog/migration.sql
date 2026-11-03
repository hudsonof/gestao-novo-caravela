CREATE TYPE "PosProductType" AS ENUM ('ENTRY', 'TABLE', 'BAR');

CREATE TABLE "PosProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PosProductType" NOT NULL,
    "basePrice" DECIMAL(18,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PosProductPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosProductPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosProduct_type_name_key" ON "PosProduct"("type", "name");
CREATE INDEX "PosProduct_type_active_idx" ON "PosProduct"("type", "active");
CREATE UNIQUE INDEX "PosProductPrice_productId_eventId_key" ON "PosProductPrice"("productId", "eventId");
CREATE INDEX "PosProductPrice_eventId_idx" ON "PosProductPrice"("eventId");

ALTER TABLE "PosProductPrice" ADD CONSTRAINT "PosProductPrice_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "PosProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosProductPrice" ADD CONSTRAINT "PosProductPrice_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

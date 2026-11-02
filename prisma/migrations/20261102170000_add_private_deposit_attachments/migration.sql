CREATE TABLE "DepositAttachment" (
  "id" TEXT NOT NULL,
  "depositId" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepositAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DepositAttachment_sizeBytes_positive" CHECK ("sizeBytes" > 0),
  CONSTRAINT "DepositAttachment_sha256_length" CHECK (length("sha256") = 64),
  CONSTRAINT "DepositAttachment_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DepositAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DepositAttachment_storagePath_key" ON "DepositAttachment"("storagePath");
CREATE INDEX "DepositAttachment_depositId_createdAt_idx" ON "DepositAttachment"("depositId", "createdAt");

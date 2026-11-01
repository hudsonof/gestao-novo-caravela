CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER');
CREATE TYPE "EventStatus" AS ENUM ('PLANNED', 'OPEN', 'CLOSING', 'CLOSED', 'CANCELLED');
CREATE TYPE "Sector" AS ENUM ('TICKETS', 'TABLES', 'BAR');
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "AccountKind" AS ENUM ('FUND', 'VAULT', 'CASH', 'BANK', 'TRANSIT', 'EXTERNAL', 'RECEIVABLE');
CREATE TYPE "EntryKind" AS ENUM ('SALE', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT', 'REVERSAL', 'DEPOSIT');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'DEBIT', 'CREDIT', 'BANK_TRANSFER');
CREATE TYPE "ExpenseStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');
CREATE TYPE "DepositStatus" AS ENUM ('PREPARED', 'IN_TRANSIT', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'MANAGER',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LoginAttempt" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);
CREATE TABLE "Employee" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "status" "EventStatus" NOT NULL DEFAULT 'PLANNED',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CashRegister" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sector" "Sector" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FinancialAccount" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "AccountKind" NOT NULL,
  "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialAccount_balance_nonnegative" CHECK ("kind" = 'EXTERNAL' OR "balance" >= 0)
);
CREATE TABLE "CashSession" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "registerId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "employeeId" TEXT,
  "openedById" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "openingFloat" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
  CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashSession_openingFloat_nonnegative" CHECK ("openingFloat" >= 0),
  CONSTRAINT "CashSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CashSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashSession_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "LedgerEntry" (
  "id" TEXT NOT NULL,
  "eventId" TEXT,
  "sessionId" TEXT,
  "debitAccountId" TEXT NOT NULL,
  "creditAccountId" TEXT NOT NULL,
  "kind" "EntryKind" NOT NULL,
  "method" "PaymentMethod",
  "category" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,
  "description" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "reversalOfId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LedgerEntry_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "LedgerEntry_accounts_differ" CHECK ("debitAccountId" <> "creditAccountId"),
  CONSTRAINT "LedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LedgerEntry_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LedgerEntry_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LedgerEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LedgerEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LedgerEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "CashClosing" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "expectedAmount" DECIMAL(18,2) NOT NULL,
  "countedAmount" DECIMAL(18,2) NOT NULL,
  "difference" DECIMAL(18,2) NOT NULL,
  "justification" TEXT,
  "closedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashClosing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashClosing_counted_nonnegative" CHECK ("countedAmount" >= 0),
  CONSTRAINT "CashClosing_difference_matches" CHECK ("difference" = "countedAmount" - "expectedAmount"),
  CONSTRAINT "CashClosing_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashClosing_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "eventId" TEXT,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "supplier" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "status" "ExpenseStatus" NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Expense_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Expense_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "ExpensePayment" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "ExpensePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpensePayment_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "ExpensePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExpensePayment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExpensePayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "Deposit" (
  "id" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "status" "DepositStatus" NOT NULL DEFAULT 'IN_TRANSIT',
  "withdrawalId" TEXT NOT NULL,
  "confirmationId" TEXT,
  "bankReference" TEXT,
  "createdById" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Deposit_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "Deposit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Deposit_confirmationId_fkey" FOREIGN KEY ("confirmationId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Deposit_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");
CREATE UNIQUE INDEX "CashRegister_name_key" ON "CashRegister"("name");
CREATE INDEX "FinancialAccount_kind_active_idx" ON "FinancialAccount"("kind", "active");
CREATE UNIQUE INDEX "CashSession_accountId_key" ON "CashSession"("accountId");
CREATE UNIQUE INDEX "CashSession_idempotencyKey_key" ON "CashSession"("idempotencyKey");
CREATE INDEX "CashSession_registerId_status_idx" ON "CashSession"("registerId", "status");
CREATE INDEX "CashSession_eventId_status_idx" ON "CashSession"("eventId", "status");
CREATE UNIQUE INDEX "CashSession_one_open_per_register" ON "CashSession"("registerId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "LedgerEntry_idempotencyKey_key" ON "LedgerEntry"("idempotencyKey");
CREATE UNIQUE INDEX "LedgerEntry_reversalOfId_key" ON "LedgerEntry"("reversalOfId");
CREATE INDEX "LedgerEntry_eventId_createdAt_idx" ON "LedgerEntry"("eventId", "createdAt");
CREATE INDEX "LedgerEntry_sessionId_createdAt_idx" ON "LedgerEntry"("sessionId", "createdAt");
CREATE INDEX "LedgerEntry_debitAccountId_createdAt_idx" ON "LedgerEntry"("debitAccountId", "createdAt");
CREATE INDEX "LedgerEntry_creditAccountId_createdAt_idx" ON "LedgerEntry"("creditAccountId", "createdAt");
CREATE INDEX "LedgerEntry_kind_createdAt_idx" ON "LedgerEntry"("kind", "createdAt");
CREATE UNIQUE INDEX "CashClosing_sessionId_key" ON "CashClosing"("sessionId");
CREATE UNIQUE INDEX "Expense_idempotencyKey_key" ON "Expense"("idempotencyKey");
CREATE INDEX "Expense_status_dueDate_idx" ON "Expense"("status", "dueDate");
CREATE INDEX "Expense_eventId_dueDate_idx" ON "Expense"("eventId", "dueDate");
CREATE UNIQUE INDEX "ExpensePayment_entryId_key" ON "ExpensePayment"("entryId");
CREATE INDEX "ExpensePayment_expenseId_paidAt_idx" ON "ExpensePayment"("expenseId", "paidAt");
CREATE UNIQUE INDEX "Deposit_withdrawalId_key" ON "Deposit"("withdrawalId");
CREATE UNIQUE INDEX "Deposit_confirmationId_key" ON "Deposit"("confirmationId");
CREATE INDEX "Deposit_status_createdAt_idx" ON "Deposit"("status", "createdAt");
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt");

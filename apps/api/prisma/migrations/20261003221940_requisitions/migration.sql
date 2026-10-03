-- CreateEnum
CREATE TYPE "PrStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'RETURNED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "approvalLevel" INTEGER;

-- CreateTable
CREATE TABLE "doa_levels" (
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "maxAmountCents" BIGINT,

    CONSTRAINT "doa_levels_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "purchase_requisitions" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "requesterId" UUID NOT NULL,
    "costCenterId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "needByDate" DATE NOT NULL,
    "status" "PrStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCents" BIGINT NOT NULL,
    "requiredLevels" INTEGER NOT NULL DEFAULT 0,
    "approvalRound" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchase_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_lines" (
    "id" UUID NOT NULL,
    "requisitionId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "uom" "Uom" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPriceCents" BIGINT NOT NULL,
    "lineTotalCents" BIGINT NOT NULL,

    CONSTRAINT "pr_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_approvals" (
    "id" UUID NOT NULL,
    "requisitionId" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "approverId" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pr_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requisitions_number_key" ON "purchase_requisitions"("number");

-- CreateIndex
CREATE INDEX "purchase_requisitions_requesterId_idx" ON "purchase_requisitions"("requesterId");

-- CreateIndex
CREATE INDEX "purchase_requisitions_status_idx" ON "purchase_requisitions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pr_lines_requisitionId_lineNo_key" ON "pr_lines"("requisitionId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "pr_approvals_requisitionId_round_level_key" ON "pr_approvals"("requisitionId", "round", "level");

-- AddForeignKey
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_lines" ADD CONSTRAINT "pr_lines_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_lines" ADD CONSTRAINT "pr_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_approvals" ADD CONSTRAINT "pr_approvals_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_approvals" ADD CONSTRAINT "pr_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Hand-written ─────────────────────────────────────────────────────────────
-- Reference data the application cannot run without belongs in a migration, not in the
-- dev seed: every environment (prod included) gets the same DoA matrix (ADR 0004).
INSERT INTO "doa_levels" ("level", "name", "maxAmountCents") VALUES
  (1, 'Team lead', 500000),          -- up to €5,000
  (2, 'Head of department', 5000000), -- up to €50,000
  (3, 'CFO', NULL);                  -- unlimited

-- Invariants the database enforces even if application code has a bug.
ALTER TABLE "pr_lines"
  ADD CONSTRAINT "pr_lines_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "pr_lines_amounts_nonnegative" CHECK ("unitPriceCents" >= 0 AND "lineTotalCents" >= 0);
ALTER TABLE "purchase_requisitions"
  ADD CONSTRAINT "purchase_requisitions_total_nonnegative" CHECK ("totalCents" >= 0);
ALTER TABLE "users"
  ADD CONSTRAINT "users_approval_level_positive" CHECK ("approvalLevel" IS NULL OR "approvalLevel" > 0);

-- CreateEnum
CREATE TYPE "SourcingStatus" AS ENUM ('OPEN', 'IN_SOURCING', 'AWARDED', 'ORDERED');

-- CreateEnum
CREATE TYPE "RfxType" AS ENUM ('RFI', 'RFP', 'RFQ');

-- CreateEnum
CREATE TYPE "RfxStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'EVALUATED', 'AWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('INVITED', 'RESPONDED', 'DECLINED');

-- CreateEnum
CREATE TYPE "Incoterm" AS ENUM ('EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF');

-- CreateEnum
CREATE TYPE "BidSource" AS ENUM ('MANUAL', 'SIMULATED');

-- AlterTable
ALTER TABLE "pr_lines" ADD COLUMN     "sourcingStatus" "SourcingStatus" NOT NULL DEFAULT 'OPEN';

-- CreateTable
CREATE TABLE "rfx_events" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "RfxType" NOT NULL,
    "title" TEXT NOT NULL,
    "buyerId" UUID NOT NULL,
    "status" "RfxStatus" NOT NULL DEFAULT 'DRAFT',
    "responseDeadline" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "evaluatedAt" TIMESTAMPTZ(3),
    "awardedAt" TIMESTAMPTZ(3),
    "awardJustification" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rfx_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfx_lines" (
    "id" UUID NOT NULL,
    "rfxId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "prLineId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "uom" "Uom" NOT NULL,
    "awardedBidLineId" UUID,

    CONSTRAINT "rfx_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfx_invitations" (
    "rfxId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'INVITED',
    "respondedAt" TIMESTAMPTZ(3),

    CONSTRAINT "rfx_invitations_pkey" PRIMARY KEY ("rfxId","supplierId")
);

-- CreateTable
CREATE TABLE "rfx_bids" (
    "id" UUID NOT NULL,
    "rfxId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "incoterm" "Incoterm" NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "validUntil" DATE NOT NULL,
    "originChargesCents" BIGINT NOT NULL DEFAULT 0,
    "freightCents" BIGINT NOT NULL DEFAULT 0,
    "insuranceCents" BIGINT NOT NULL DEFAULT 0,
    "destinationHandlingCents" BIGINT NOT NULL DEFAULT 0,
    "dutyRateBps" INTEGER NOT NULL DEFAULT 0,
    "source" "BidSource" NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfx_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfx_bid_lines" (
    "id" UUID NOT NULL,
    "bidId" UUID NOT NULL,
    "rfxLineId" UUID NOT NULL,
    "unitPriceCents" BIGINT NOT NULL,

    CONSTRAINT "rfx_bid_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rfx_events_number_key" ON "rfx_events"("number");

-- CreateIndex
CREATE INDEX "rfx_events_status_idx" ON "rfx_events"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rfx_lines_awardedBidLineId_key" ON "rfx_lines"("awardedBidLineId");

-- CreateIndex
CREATE INDEX "rfx_lines_prLineId_idx" ON "rfx_lines"("prLineId");

-- CreateIndex
CREATE UNIQUE INDEX "rfx_lines_rfxId_lineNo_key" ON "rfx_lines"("rfxId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "rfx_bids_rfxId_supplierId_key" ON "rfx_bids"("rfxId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "rfx_bid_lines_bidId_rfxLineId_key" ON "rfx_bid_lines"("bidId", "rfxLineId");

-- AddForeignKey
ALTER TABLE "rfx_events" ADD CONSTRAINT "rfx_events_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfx_lines" ADD CONSTRAINT "rfx_lines_rfxId_fkey" FOREIGN KEY ("rfxId") REFERENCES "rfx_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfx_lines" ADD CONSTRAINT "rfx_lines_prLineId_fkey" FOREIGN KEY ("prLineId") REFERENCES "pr_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfx_lines" ADD CONSTRAINT "rfx_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfx_lines" ADD CONSTRAINT "rfx_lines_awardedBidLineId_fkey" FOREIGN KEY ("awardedBidLineId") REFERENCES "rfx_bid_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfx_invitations" ADD CONSTRAINT "rfx_invitations_rfxId_fkey" FOREIGN KEY ("rfxId") REFERENCES "rfx_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfx_invitations" ADD CONSTRAINT "rfx_invitations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfx_bids" ADD CONSTRAINT "rfx_bids_rfxId_fkey" FOREIGN KEY ("rfxId") REFERENCES "rfx_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfx_bids" ADD CONSTRAINT "rfx_bids_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfx_bid_lines" ADD CONSTRAINT "rfx_bid_lines_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "rfx_bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfx_bid_lines" ADD CONSTRAINT "rfx_bid_lines_rfxLineId_fkey" FOREIGN KEY ("rfxLineId") REFERENCES "rfx_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Hand-written invariants ──────────────────────────────────────────────────
ALTER TABLE "rfx_lines" ADD CONSTRAINT "rfx_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "rfx_bids"
  ADD CONSTRAINT "rfx_bids_amounts_nonnegative" CHECK (
    "originChargesCents" >= 0 AND "freightCents" >= 0 AND "insuranceCents" >= 0
    AND "destinationHandlingCents" >= 0 AND "leadTimeDays" >= 0
    AND "dutyRateBps" BETWEEN 0 AND 100000
  );
ALTER TABLE "rfx_bid_lines" ADD CONSTRAINT "rfx_bid_lines_price_nonnegative" CHECK ("unitPriceCents" >= 0);

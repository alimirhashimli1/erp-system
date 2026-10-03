-- CreateEnum
CREATE TYPE "PoStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "buyerId" UUID NOT NULL,
    "rfxId" UUID NOT NULL,
    "status" "PoStatus" NOT NULL DEFAULT 'DRAFT',
    "incoterm" "Incoterm" NOT NULL,
    "namedPlace" TEXT NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "totalCents" BIGINT NOT NULL,
    "expectedDeliveryDate" DATE,
    "issuedAt" TIMESTAMPTZ(3),
    "acknowledgedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_lines" (
    "id" UUID NOT NULL,
    "poId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "prLineId" UUID NOT NULL,
    "activePrLineId" UUID,
    "rfxBidLineId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "uom" "Uom" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPriceCents" BIGINT NOT NULL,
    "lineTotalCents" BIGINT NOT NULL,
    "receivedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "invoicedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "po_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "po_lines_activePrLineId_key" ON "po_lines"("activePrLineId");

-- CreateIndex
CREATE UNIQUE INDEX "po_lines_rfxBidLineId_key" ON "po_lines"("rfxBidLineId");

-- CreateIndex
CREATE INDEX "po_lines_prLineId_idx" ON "po_lines"("prLineId");

-- CreateIndex
CREATE UNIQUE INDEX "po_lines_poId_lineNo_key" ON "po_lines"("poId", "lineNo");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_rfxId_fkey" FOREIGN KEY ("rfxId") REFERENCES "rfx_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_prLineId_fkey" FOREIGN KEY ("prLineId") REFERENCES "pr_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_rfxBidLineId_fkey" FOREIGN KEY ("rfxBidLineId") REFERENCES "rfx_bid_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Hand-written invariants ──────────────────────────────────────────────────
ALTER TABLE "po_lines"
  ADD CONSTRAINT "po_lines_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "po_lines_amounts_nonnegative" CHECK ("unitPriceCents" >= 0 AND "lineTotalCents" >= 0),
  -- You can't receive or invoice a negative amount, and never receive more than ordered.
  ADD CONSTRAINT "po_lines_received_within_ordered" CHECK ("receivedQuantity" >= 0 AND "receivedQuantity" <= "quantity"),
  ADD CONSTRAINT "po_lines_invoiced_nonnegative" CHECK ("invoicedQuantity" >= 0),
  -- activePrLineId is either NULL (cancelled) or mirrors prLineId.
  ADD CONSTRAINT "po_lines_active_pr_line_matches" CHECK ("activePrLineId" IS NULL OR "activePrLineId" = "prLineId");
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_total_nonnegative" CHECK ("totalCents" >= 0);

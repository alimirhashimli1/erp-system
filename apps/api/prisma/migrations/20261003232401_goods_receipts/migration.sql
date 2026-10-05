-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "poId" UUID NOT NULL,
    "receivedById" UUID NOT NULL,
    "deliveryNote" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gr_lines" (
    "id" UUID NOT NULL,
    "grId" UUID NOT NULL,
    "poLineId" UUID NOT NULL,
    "receivedQuantity" DECIMAL(14,3) NOT NULL,
    "rejectedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "acceptedQuantity" DECIMAL(14,3) NOT NULL,
    "rejectionReason" TEXT,

    CONSTRAINT "gr_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_number_key" ON "goods_receipts"("number");

-- CreateIndex
CREATE INDEX "goods_receipts_poId_idx" ON "goods_receipts"("poId");

-- CreateIndex
CREATE UNIQUE INDEX "gr_lines_grId_poLineId_key" ON "gr_lines"("grId", "poLineId");

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gr_lines" ADD CONSTRAINT "gr_lines_grId_fkey" FOREIGN KEY ("grId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gr_lines" ADD CONSTRAINT "gr_lines_poLineId_fkey" FOREIGN KEY ("poLineId") REFERENCES "po_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Hand-written invariants ──────────────────────────────────────────────────
ALTER TABLE "gr_lines"
  ADD CONSTRAINT "gr_lines_quantities_valid" CHECK (
    "receivedQuantity" >= 0 AND "rejectedQuantity" >= 0
    AND "rejectedQuantity" <= "receivedQuantity"
    AND "acceptedQuantity" = "receivedQuantity" - "rejectedQuantity"
  );

-- Goods receipts are evidence for payment (3-way match): never edited, never deleted.
-- Corrections are posted as new documents.
CREATE FUNCTION goods_receipts_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is immutable (% blocked)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER goods_receipts_immutable
  BEFORE UPDATE OR DELETE ON "goods_receipts"
  FOR EACH ROW EXECUTE FUNCTION goods_receipts_block_mutation();
CREATE TRIGGER gr_lines_immutable
  BEFORE UPDATE OR DELETE ON "gr_lines"
  FOR EACH ROW EXECUTE FUNCTION goods_receipts_block_mutation();

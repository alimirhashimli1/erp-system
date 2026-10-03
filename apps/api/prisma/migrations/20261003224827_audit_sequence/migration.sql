-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "seq" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_seq_key" ON "audit_logs"("seq");


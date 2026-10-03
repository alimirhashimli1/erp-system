-- CreateTable
CREATE TABLE "document_counters" (
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("type")
);


-- Hand-written: the init migration's row trigger blocks UPDATE/DELETE on audit_logs,
-- but TRUNCATE skips row triggers. Close that gap with a statement-level trigger.
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_mutation();

-- CreateTable
CREATE TABLE "entries" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "event_id" TEXT,
    "timestamp_utc" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "user_id" TEXT,
    "event_type" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "category" TEXT,
    "application" TEXT,
    "success" BOOLEAN,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entries_sequence_key" ON "entries"("sequence");

-- CreateIndex
CREATE INDEX "entries_tenant_id_school_id_timestamp_utc_idx" ON "entries"("tenant_id", "school_id", "timestamp_utc");

-- CreateIndex
CREATE INDEX "entries_user_id_idx" ON "entries"("user_id");

-- CreateIndex
CREATE INDEX "entries_event_type_idx" ON "entries"("event_type");

-- CreateIndex
CREATE INDEX "entries_entity_type_idx" ON "entries"("entity_type");

-- CreateIndex
CREATE INDEX "entries_application_idx" ON "entries"("application");

-- CreateIndex
CREATE INDEX "entries_success_idx" ON "entries"("success");

-- Lets us filter/search inside the flexible `extra` JSON blob without a full
-- table scan.
CREATE INDEX "entries_extra_gin_idx" ON "entries" USING GIN ("extra" jsonb_path_ops);

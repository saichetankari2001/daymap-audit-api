-- CreateTable
CREATE TABLE "entries" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "school_code" TEXT NOT NULL,
    "user_id" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entries_sequence_key" ON "entries"("sequence");

-- CreateIndex
CREATE INDEX "entries_jurisdiction_school_code_date_idx" ON "entries"("jurisdiction", "school_code", "date");

-- CreateIndex
CREATE INDEX "entries_user_id_idx" ON "entries"("user_id");

-- Lets us filter/search inside the flexible `extra` JSON blob (arbitrary
-- fields per Harry's brief) without a full table scan.
CREATE INDEX "entries_extra_gin_idx" ON "entries" USING GIN ("extra" jsonb_path_ops);

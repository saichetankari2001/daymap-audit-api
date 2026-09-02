-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "hashed_key" TEXT NOT NULL,
    "label" TEXT,
    "permission" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key_scopes" (
    "id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_value" TEXT NOT NULL,
    "scope_tenant_id" TEXT,

    CONSTRAINT "api_key_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_hashed_key_key" ON "api_keys"("hashed_key");

-- CreateIndex
CREATE INDEX "api_keys_hashed_key_idx" ON "api_keys"("hashed_key");

-- CreateIndex
CREATE INDEX "api_key_scopes_api_key_id_idx" ON "api_key_scopes"("api_key_id");

-- CreateIndex
-- scope_tenant_id is part of this index (not just scope_type/scope_value)
-- because a "school" scope is only meaningful together with the tenant it
-- belongs to — see the ApiKeyScope model comment in schema.prisma.
CREATE INDEX "api_key_scopes_scope_type_scope_tenant_id_scope_value_idx" ON "api_key_scopes"("scope_type", "scope_tenant_id", "scope_value");

-- AddForeignKey
ALTER TABLE "api_key_scopes" ADD CONSTRAINT "api_key_scopes_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

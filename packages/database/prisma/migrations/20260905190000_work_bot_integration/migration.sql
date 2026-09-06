CREATE TABLE "work_bot_group_bindings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platform" VARCHAR(32) NOT NULL,
    "bot_id" VARCHAR(255) NOT NULL,
    "group_id" VARCHAR(255) NOT NULL,
    "store_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "work_bot_group_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_bot_member_bindings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_binding_id" UUID NOT NULL,
    "sender_id" VARCHAR(255) NOT NULL,
    "membership_id" UUID NOT NULL,
    "active_work_record_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "work_bot_member_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_bot_aliases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "alias" VARCHAR(80) NOT NULL,
    "alias_normalized" VARCHAR(80) NOT NULL,
    "service_item_id" UUID NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "work_bot_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_bot_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platform" VARCHAR(32) NOT NULL,
    "bot_id" VARCHAR(255) NOT NULL,
    "group_id" VARCHAR(255) NOT NULL,
    "sender_id" VARCHAR(255) NOT NULL,
    "message_id" VARCHAR(255) NOT NULL,
    "group_binding_id" UUID,
    "store_id" UUID,
    "work_record_id" UUID,
    "intent" VARCHAR(32) NOT NULL,
    "outcome" VARCHAR(48) NOT NULL,
    "raw_text" VARCHAR(1000) NOT NULL,
    "parsed_json" JSONB,
    "reply" VARCHAR(1000) NOT NULL,
    "error_code" VARCHAR(100),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_bot_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_bot_group_bindings_platform_bot_id_group_id_key" ON "work_bot_group_bindings"("platform", "bot_id", "group_id");
CREATE INDEX "work_bot_group_bindings_store_id_updated_at_idx" ON "work_bot_group_bindings"("store_id", "updated_at");
CREATE UNIQUE INDEX "work_bot_member_bindings_active_work_record_id_key" ON "work_bot_member_bindings"("active_work_record_id");
CREATE UNIQUE INDEX "work_bot_member_bindings_group_binding_id_sender_id_key" ON "work_bot_member_bindings"("group_binding_id", "sender_id");
CREATE UNIQUE INDEX "work_bot_member_bindings_group_binding_id_membership_id_key" ON "work_bot_member_bindings"("group_binding_id", "membership_id");
CREATE INDEX "work_bot_member_bindings_membership_id_idx" ON "work_bot_member_bindings"("membership_id");
CREATE UNIQUE INDEX "work_bot_aliases_store_id_alias_normalized_key" ON "work_bot_aliases"("store_id", "alias_normalized");
CREATE INDEX "work_bot_aliases_store_id_is_enabled_idx" ON "work_bot_aliases"("store_id", "is_enabled");
CREATE UNIQUE INDEX "work_bot_operations_platform_bot_id_group_id_message_id_key" ON "work_bot_operations"("platform", "bot_id", "group_id", "message_id");
CREATE INDEX "work_bot_operations_store_id_created_at_idx" ON "work_bot_operations"("store_id", "created_at");
CREATE INDEX "work_bot_operations_group_binding_id_sender_id_created_at_idx" ON "work_bot_operations"("group_binding_id", "sender_id", "created_at");

ALTER TABLE "work_bot_group_bindings" ADD CONSTRAINT "work_bot_group_bindings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_bot_member_bindings" ADD CONSTRAINT "work_bot_member_bindings_group_binding_id_fkey" FOREIGN KEY ("group_binding_id") REFERENCES "work_bot_group_bindings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_bot_member_bindings" ADD CONSTRAINT "work_bot_member_bindings_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "store_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_bot_member_bindings" ADD CONSTRAINT "work_bot_member_bindings_active_work_record_id_fkey" FOREIGN KEY ("active_work_record_id") REFERENCES "work_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_bot_aliases" ADD CONSTRAINT "work_bot_aliases_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_bot_aliases" ADD CONSTRAINT "work_bot_aliases_service_item_id_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_bot_operations" ADD CONSTRAINT "work_bot_operations_group_binding_id_fkey" FOREIGN KEY ("group_binding_id") REFERENCES "work_bot_group_bindings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_bot_operations" ADD CONSTRAINT "work_bot_operations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_bot_operations" ADD CONSTRAINT "work_bot_operations_work_record_id_fkey" FOREIGN KEY ("work_record_id") REFERENCES "work_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

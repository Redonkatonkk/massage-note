CREATE TYPE "ClosingImageLocale" AS ENUM ('zh_CN', 'en_US');
CREATE TYPE "ClosingDeliveryStatus" AS ENUM ('QUEUED', 'CLAIMED', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "ClosingDeliveryKind" AS ENUM ('INITIAL', 'RESEND');

ALTER TABLE "stores"
  ADD COLUMN "closing_default_locale" "ClosingImageLocale" NOT NULL DEFAULT 'zh_CN';

ALTER TABLE "store_memberships"
  ADD COLUMN "closing_delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "closing_delivery_phone_e164" TEXT,
  ADD COLUMN "closing_image_locale" "ClosingImageLocale";

CREATE TABLE "employee_closing_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_id" UUID NOT NULL,
  "closing_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "kind" "ClosingDeliveryKind" NOT NULL,
  "status" "ClosingDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "recipient_phone_e164" TEXT NOT NULL,
  "locale" "ClosingImageLocale" NOT NULL,
  "snapshot_json" JSONB NOT NULL,
  "queued_by" UUID NOT NULL,
  "request_key" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "lease_token" UUID,
  "lease_expires_at" TIMESTAMPTZ(3),
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error_code" TEXT,
  "last_error" TEXT,
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_closing_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "closing_delivery_agents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "token_prefix" TEXT NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3),
  "last_status_json" JSONB,
  "revoked_at" TIMESTAMPTZ(3),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "closing_delivery_agents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_closing_deliveries_store_id_closing_id_membership_id_kind_request_key_key"
  ON "employee_closing_deliveries"("store_id", "closing_id", "membership_id", "kind", "request_key");
CREATE INDEX "employee_closing_deliveries_status_next_attempt_at_created_at_idx"
  ON "employee_closing_deliveries"("status", "next_attempt_at", "created_at");
CREATE INDEX "employee_closing_deliveries_store_id_closing_id_created_at_idx"
  ON "employee_closing_deliveries"("store_id", "closing_id", "created_at");
CREATE INDEX "employee_closing_deliveries_store_id_membership_id_created_at_idx"
  ON "employee_closing_deliveries"("store_id", "membership_id", "created_at");
CREATE UNIQUE INDEX "closing_delivery_agents_store_id_key" ON "closing_delivery_agents"("store_id");
CREATE UNIQUE INDEX "closing_delivery_agents_token_prefix_key" ON "closing_delivery_agents"("token_prefix");

ALTER TABLE "employee_closing_deliveries"
  ADD CONSTRAINT "employee_closing_deliveries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_closing_deliveries_closing_id_fkey" FOREIGN KEY ("closing_id") REFERENCES "business_day_closings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_closing_deliveries_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "closing_delivery_agents"
  ADD CONSTRAINT "closing_delivery_agents_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

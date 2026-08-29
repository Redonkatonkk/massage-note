CREATE TABLE "employee_settlement_deliveries" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "payment_scope" TEXT NOT NULL,
    "status" "ClosingDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "recipient_phone_e164" TEXT NOT NULL,
    "locale" "ClosingImageLocale" NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "queued_by" UUID NOT NULL,
    "request_key" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(3),
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary_sent_at" TIMESTAMPTZ(3),
    "detail_sent_at" TIMESTAMPTZ(3),
    "last_error_code" TEXT,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_settlement_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_settlement_deliveries_scope_check" CHECK ("payment_scope" IN ('CASH', 'NON_CASH', 'ALL')),
    CONSTRAINT "employee_settlement_deliveries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "employee_settlement_deliveries_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "employee_settlement_deliveries_store_id_request_key_key" ON "employee_settlement_deliveries"("store_id", "request_key");
CREATE INDEX "employee_settlement_deliveries_status_next_attempt_at_created_at_idx" ON "employee_settlement_deliveries"("status", "next_attempt_at", "created_at");
CREATE INDEX "employee_settlement_deliveries_store_id_membership_id_created_at_idx" ON "employee_settlement_deliveries"("store_id", "membership_id", "created_at");

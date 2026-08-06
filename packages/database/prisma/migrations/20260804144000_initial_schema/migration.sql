-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('SETUP', 'ACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkRecordStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ClosingStatus" AS ENUM ('CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CashSettlementStatus" AS ENUM ('UNSETTLED', 'SETTLED');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('SERVICE', 'ADDON');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiAssistantType" AS ENUM ('WORK_RECORD', 'FINANCE');

-- CreateEnum
CREATE TYPE "AiPreviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "store_code" CHAR(6) NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "business_cutoff_local" VARCHAR(5) NOT NULL,
    "global_commission_bps" INTEGER NOT NULL,
    "owner_membership_id" UUID,
    "status" "StoreStatus" NOT NULL DEFAULT 'SETUP',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,
    "delete_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_memberships" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "display_name" TEXT NOT NULL,
    "display_name_normalized" TEXT NOT NULL,
    "is_service_provider" BOOLEAN NOT NULL DEFAULT true,
    "default_commission_bps" INTEGER,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,
    "delete_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_join_requests" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "requested_display_name" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "clock_in_at" TIMESTAMPTZ(3) NOT NULL,
    "clock_out_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_boards" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_employee_rows" (
    "id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "position" DECIMAL(20,10) NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "added_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_employee_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_items" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "price_cents" BIGINT NOT NULL,
    "default_commission_bps" INTEGER,
    "position" INTEGER NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,
    "delete_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_items" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "duration_minutes" INTEGER,
    "default_commission_bps" INTEGER,
    "position" INTEGER NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,
    "delete_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "addon_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_items" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,
    "delete_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "discount_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_default_commissions" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "commission_bps" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_to" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_default_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_item_commissions" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "item_id" UUID NOT NULL,
    "commission_bps" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_to" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_item_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_records" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "employee_membership_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "store_timezone_snapshot" TEXT NOT NULL,
    "business_cutoff_snapshot" VARCHAR(5) NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3),
    "actual_duration_minutes" INTEGER,
    "status" "WorkRecordStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "main_service_amount_cents" BIGINT NOT NULL,
    "addon_total_cents" BIGINT NOT NULL DEFAULT 0,
    "gross_fee_base_cents" BIGINT NOT NULL,
    "discount_total_cents" BIGINT NOT NULL DEFAULT 0,
    "discounted_fee_performance_cents" BIGINT NOT NULL,
    "cash_service_cents" BIGINT,
    "card_service_cents" BIGINT,
    "cash_tip_cents" BIGINT,
    "card_tip_cents" BIGINT,
    "total_tip_cents" BIGINT,
    "actual_service_collected_cents" BIGINT,
    "customer_total_paid_cents" BIGINT,
    "payment_difference_cents" BIGINT,
    "main_service_wage_cents" BIGINT NOT NULL,
    "addon_wage_cents" BIGINT NOT NULL DEFAULT 0,
    "total_large_fee_wage_cents" BIGINT NOT NULL,
    "employee_total_income_cents" BIGINT,
    "cash_allocated_service_wage_cents" BIGINT,
    "cash_acquired_service_wage_cents" BIGINT,
    "cash_wage_shortfall_cents" BIGINT,
    "tip_settled_manual_flag" BOOLEAN NOT NULL DEFAULT false,
    "large_fee_settled_manual_flag" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,
    "delete_reason" TEXT,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_record_service_snapshots" (
    "id" UUID NOT NULL,
    "work_record_id" UUID NOT NULL,
    "source_service_item_id" UUID,
    "is_custom" BOOLEAN NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "commission_bps" INTEGER NOT NULL,
    "commission_source" TEXT NOT NULL,
    "wage_cents" BIGINT NOT NULL,

    CONSTRAINT "work_record_service_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_record_addon_snapshots" (
    "id" UUID NOT NULL,
    "work_record_id" UUID NOT NULL,
    "source_addon_item_id" UUID,
    "is_custom" BOOLEAN NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "duration_minutes" INTEGER,
    "commission_bps" INTEGER NOT NULL,
    "commission_source" TEXT NOT NULL,
    "wage_cents" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "work_record_addon_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_record_discount_snapshots" (
    "id" UUID NOT NULL,
    "work_record_id" UUID NOT NULL,
    "source_discount_item_id" UUID,
    "is_custom" BOOLEAN NOT NULL,
    "name" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "work_record_discount_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_breakdowns" (
    "id" UUID NOT NULL,
    "work_record_id" UUID NOT NULL,
    "cash_service_cents" BIGINT,
    "card_service_cents" BIGINT,
    "cash_tip_cents" BIGINT,
    "card_tip_cents" BIGINT,
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_breakdowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_day_closings" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "cycle_no" INTEGER NOT NULL,
    "status" "ClosingStatus" NOT NULL DEFAULT 'CLOSED',
    "is_forced" BOOLEAN NOT NULL DEFAULT false,
    "force_reason" TEXT,
    "warning_snapshot_json" JSONB NOT NULL,
    "totals_snapshot_json" JSONB NOT NULL,
    "closed_by" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "business_day_closings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_cash_settlements" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "membership_id" UUID NOT NULL,
    "cash_service_cents" BIGINT NOT NULL,
    "cash_tip_cents" BIGINT NOT NULL,
    "cash_received_cents" BIGINT NOT NULL,
    "cash_allocated_service_wage_cents" BIGINT NOT NULL,
    "cash_acquired_service_wage_cents" BIGINT NOT NULL,
    "cash_wage_shortfall_cents" BIGINT NOT NULL,
    "cash_retained_cents" BIGINT NOT NULL,
    "cash_to_submit_to_store_cents" BIGINT NOT NULL,
    "status" "CashSettlementStatus" NOT NULL DEFAULT 'UNSETTLED',
    "note" TEXT NOT NULL DEFAULT '',
    "settled_by" UUID,
    "settled_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,
    "delete_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_cash_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_settlements" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "settlement_date" DATE NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "service_wage_cents" BIGINT NOT NULL,
    "cash_tip_cents" BIGINT NOT NULL,
    "card_tip_cents" BIGINT NOT NULL,
    "adjustment_cents" BIGINT NOT NULL,
    "total_paid_cents" BIGINT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,
    "delete_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payroll_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_membership_id" UUID,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "business_date" DATE,
    "before_json" JSONB,
    "after_json" JSONB,
    "reason" TEXT,
    "request_id" TEXT NOT NULL,
    "idempotency_key_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_requests" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response_code" INTEGER,
    "response_json" JSONB,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_outbox" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload_json" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assistant_type" "AiAssistantType" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_query_logs" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "model_provider" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "input_text" TEXT NOT NULL,
    "tool_calls_json" JSONB,
    "tool_results_redacted_json" JSONB,
    "outcome" TEXT NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_change_previews" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "canonical_payload_json" JSONB NOT NULL,
    "base_versions_json" JSONB NOT NULL,
    "warnings_json" JSONB NOT NULL,
    "status" "AiPreviewStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_change_previews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "stores_store_code_key" ON "stores"("store_code");

-- CreateIndex
CREATE UNIQUE INDEX "stores_owner_membership_id_key" ON "stores"("owner_membership_id");

-- CreateIndex
CREATE INDEX "stores_status_idx" ON "stores"("status");

-- CreateIndex
CREATE INDEX "store_memberships_store_id_status_idx" ON "store_memberships"("store_id", "status");

-- CreateIndex
CREATE INDEX "store_memberships_store_id_display_name_normalized_idx" ON "store_memberships"("store_id", "display_name_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "store_memberships_store_id_user_id_key" ON "store_memberships"("store_id", "user_id");

-- CreateIndex
CREATE INDEX "store_join_requests_store_id_status_idx" ON "store_join_requests"("store_id", "status");

-- CreateIndex
CREATE INDEX "store_join_requests_user_id_status_idx" ON "store_join_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "shifts_store_id_business_date_idx" ON "shifts"("store_id", "business_date");

-- CreateIndex
CREATE INDEX "shifts_membership_id_clock_out_at_idx" ON "shifts"("membership_id", "clock_out_at");

-- CreateIndex
CREATE UNIQUE INDEX "daily_boards_store_id_business_date_key" ON "daily_boards"("store_id", "business_date");

-- CreateIndex
CREATE INDEX "daily_employee_rows_store_id_position_idx" ON "daily_employee_rows"("store_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "daily_employee_rows_board_id_membership_id_key" ON "daily_employee_rows"("board_id", "membership_id");

-- CreateIndex
CREATE INDEX "service_items_store_id_is_enabled_position_idx" ON "service_items"("store_id", "is_enabled", "position");

-- CreateIndex
CREATE INDEX "addon_items_store_id_is_enabled_position_idx" ON "addon_items"("store_id", "is_enabled", "position");

-- CreateIndex
CREATE INDEX "discount_items_store_id_is_enabled_position_idx" ON "discount_items"("store_id", "is_enabled", "position");

-- CreateIndex
CREATE INDEX "employee_default_commissions_store_id_membership_id_effecti_idx" ON "employee_default_commissions"("store_id", "membership_id", "effective_from");

-- CreateIndex
CREATE INDEX "employee_item_commissions_store_id_membership_id_item_type__idx" ON "employee_item_commissions"("store_id", "membership_id", "item_type", "item_id", "effective_from");

-- CreateIndex
CREATE INDEX "work_records_store_id_business_date_start_at_idx" ON "work_records"("store_id", "business_date", "start_at");

-- CreateIndex
CREATE INDEX "work_records_store_id_employee_membership_id_business_date_idx" ON "work_records"("store_id", "employee_membership_id", "business_date");

-- CreateIndex
CREATE INDEX "work_records_store_id_status_idx" ON "work_records"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "work_record_service_snapshots_work_record_id_key" ON "work_record_service_snapshots"("work_record_id");

-- CreateIndex
CREATE INDEX "work_record_addon_snapshots_work_record_id_position_idx" ON "work_record_addon_snapshots"("work_record_id", "position");

-- CreateIndex
CREATE INDEX "work_record_discount_snapshots_work_record_id_position_idx" ON "work_record_discount_snapshots"("work_record_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "payment_breakdowns_work_record_id_key" ON "payment_breakdowns"("work_record_id");

-- CreateIndex
CREATE INDEX "business_day_closings_store_id_business_date_status_idx" ON "business_day_closings"("store_id", "business_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "business_day_closings_store_id_business_date_cycle_no_key" ON "business_day_closings"("store_id", "business_date", "cycle_no");

-- CreateIndex
CREATE INDEX "daily_cash_settlements_store_id_status_business_date_idx" ON "daily_cash_settlements"("store_id", "status", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_cash_settlements_store_id_business_date_membership_id_key" ON "daily_cash_settlements"("store_id", "business_date", "membership_id");

-- CreateIndex
CREATE INDEX "payroll_settlements_store_id_membership_id_settlement_date_idx" ON "payroll_settlements"("store_id", "membership_id", "settlement_date");

-- CreateIndex
CREATE INDEX "audit_logs_store_id_created_at_idx" ON "audit_logs"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_store_id_entity_type_entity_id_idx" ON "audit_logs"("store_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_store_id_business_date_idx" ON "audit_logs"("store_id", "business_date");

-- CreateIndex
CREATE INDEX "idempotency_requests_expires_at_idx" ON "idempotency_requests"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_requests_store_id_user_id_key_route_key" ON "idempotency_requests"("store_id", "user_id", "key", "route");

-- CreateIndex
CREATE INDEX "domain_outbox_status_created_at_idx" ON "domain_outbox"("status", "created_at");

-- CreateIndex
CREATE INDEX "domain_outbox_store_id_created_at_idx" ON "domain_outbox"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_conversations_store_id_user_id_last_message_at_idx" ON "ai_conversations"("store_id", "user_id", "last_message_at");

-- CreateIndex
CREATE INDEX "ai_query_logs_store_id_created_at_idx" ON "ai_query_logs"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_change_previews_store_id_user_id_status_expires_at_idx" ON "ai_change_previews"("store_id", "user_id", "status", "expires_at");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_membership_id_fkey" FOREIGN KEY ("owner_membership_id") REFERENCES "store_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_memberships" ADD CONSTRAINT "store_memberships_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_memberships" ADD CONSTRAINT "store_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_join_requests" ADD CONSTRAINT "store_join_requests_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_join_requests" ADD CONSTRAINT "store_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_boards" ADD CONSTRAINT "daily_boards_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_employee_rows" ADD CONSTRAINT "daily_employee_rows_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "daily_boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_employee_rows" ADD CONSTRAINT "daily_employee_rows_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addon_items" ADD CONSTRAINT "addon_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_items" ADD CONSTRAINT "discount_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_default_commissions" ADD CONSTRAINT "employee_default_commissions_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_item_commissions" ADD CONSTRAINT "employee_item_commissions_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_employee_membership_id_fkey" FOREIGN KEY ("employee_membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_record_service_snapshots" ADD CONSTRAINT "work_record_service_snapshots_work_record_id_fkey" FOREIGN KEY ("work_record_id") REFERENCES "work_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_record_addon_snapshots" ADD CONSTRAINT "work_record_addon_snapshots_work_record_id_fkey" FOREIGN KEY ("work_record_id") REFERENCES "work_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_record_discount_snapshots" ADD CONSTRAINT "work_record_discount_snapshots_work_record_id_fkey" FOREIGN KEY ("work_record_id") REFERENCES "work_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_breakdowns" ADD CONSTRAINT "payment_breakdowns_work_record_id_fkey" FOREIGN KEY ("work_record_id") REFERENCES "work_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_day_closings" ADD CONSTRAINT "business_day_closings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_cash_settlements" ADD CONSTRAINT "daily_cash_settlements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_cash_settlements" ADD CONSTRAINT "daily_cash_settlements_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_settlements" ADD CONSTRAINT "payroll_settlements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_settlements" ADD CONSTRAINT "payroll_settlements_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_requests" ADD CONSTRAINT "idempotency_requests_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_outbox" ADD CONSTRAINT "domain_outbox_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_query_logs" ADD CONSTRAINT "ai_query_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_query_logs" ADD CONSTRAINT "ai_query_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_change_previews" ADD CONSTRAINT "ai_change_previews_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written constraints that Prisma's data model cannot express.
CREATE UNIQUE INDEX store_memberships_one_active_owner
  ON store_memberships (store_id)
  WHERE role = 'OWNER' AND status = 'ACTIVE' AND deleted_at IS NULL;

CREATE UNIQUE INDEX store_memberships_active_display_name
  ON store_memberships (store_id, display_name_normalized)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;

CREATE UNIQUE INDEX store_join_requests_one_pending_per_user
  ON store_join_requests (store_id, user_id)
  WHERE status = 'PENDING';

CREATE UNIQUE INDEX shifts_one_open_shift_per_member
  ON shifts (store_id, membership_id)
  WHERE clock_out_at IS NULL;

CREATE UNIQUE INDEX business_day_closings_one_active_cycle
  ON business_day_closings (store_id, business_date)
  WHERE status = 'CLOSED';

ALTER TABLE stores
  ADD CONSTRAINT stores_code_six_digits
  CHECK (store_code ~ '^[0-9]{6}$');

ALTER TABLE stores
  ADD CONSTRAINT stores_commission_range
  CHECK (global_commission_bps BETWEEN 0 AND 10000);

ALTER TABLE stores
  ADD CONSTRAINT stores_business_cutoff_format
  CHECK (business_cutoff_local ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE store_memberships
  ADD CONSTRAINT memberships_commission_range
  CHECK (default_commission_bps IS NULL OR default_commission_bps BETWEEN 0 AND 10000);

ALTER TABLE service_items
  ADD CONSTRAINT service_items_valid_values
  CHECK (
    duration_minutes BETWEEN 1 AND 720 AND price_cents >= 0 AND
    (default_commission_bps IS NULL OR default_commission_bps BETWEEN 0 AND 10000)
  );

ALTER TABLE addon_items
  ADD CONSTRAINT addon_items_valid_values
  CHECK (
    amount_cents >= 0 AND
    (duration_minutes IS NULL OR duration_minutes BETWEEN 0 AND 720) AND
    (default_commission_bps IS NULL OR default_commission_bps BETWEEN 0 AND 10000)
  );

ALTER TABLE discount_items
  ADD CONSTRAINT discount_items_non_negative_amount
  CHECK (amount_cents >= 0);

ALTER TABLE employee_default_commissions
  ADD CONSTRAINT employee_default_commissions_valid_values
  CHECK (
    commission_bps BETWEEN 0 AND 10000 AND
    (effective_to IS NULL OR effective_to > effective_from)
  );

ALTER TABLE employee_item_commissions
  ADD CONSTRAINT employee_item_commissions_valid_values
  CHECK (
    commission_bps BETWEEN 0 AND 10000 AND
    (effective_to IS NULL OR effective_to > effective_from)
  );

ALTER TABLE shifts
  ADD CONSTRAINT shifts_end_not_before_start
  CHECK (clock_out_at IS NULL OR clock_out_at >= clock_in_at);

ALTER TABLE work_records
  ADD CONSTRAINT work_records_end_not_before_start
  CHECK (end_at IS NULL OR end_at >= start_at);

ALTER TABLE work_records
  ADD CONSTRAINT work_records_non_negative_money
  CHECK (
    main_service_amount_cents >= 0 AND addon_total_cents >= 0 AND
    gross_fee_base_cents >= 0 AND discount_total_cents >= 0 AND
    discounted_fee_performance_cents >= 0 AND main_service_wage_cents >= 0 AND
    addon_wage_cents >= 0 AND total_large_fee_wage_cents >= 0 AND
    (cash_service_cents IS NULL OR cash_service_cents >= 0) AND
    (card_service_cents IS NULL OR card_service_cents >= 0) AND
    (cash_tip_cents IS NULL OR cash_tip_cents >= 0) AND
    (card_tip_cents IS NULL OR card_tip_cents >= 0) AND
    (total_tip_cents IS NULL OR total_tip_cents >= 0) AND
    (actual_service_collected_cents IS NULL OR actual_service_collected_cents >= 0) AND
    (customer_total_paid_cents IS NULL OR customer_total_paid_cents >= 0) AND
    (employee_total_income_cents IS NULL OR employee_total_income_cents >= 0) AND
    (cash_allocated_service_wage_cents IS NULL OR cash_allocated_service_wage_cents >= 0) AND
    (cash_acquired_service_wage_cents IS NULL OR cash_acquired_service_wage_cents >= 0) AND
    (cash_wage_shortfall_cents IS NULL OR cash_wage_shortfall_cents >= 0) AND
    (cash_acquired_service_wage_cents IS NULL OR cash_allocated_service_wage_cents IS NULL OR
      cash_acquired_service_wage_cents <= cash_allocated_service_wage_cents) AND
    (cash_wage_shortfall_cents IS NULL OR cash_allocated_service_wage_cents IS NULL OR
      cash_acquired_service_wage_cents IS NULL OR
      cash_wage_shortfall_cents =
        cash_allocated_service_wage_cents - cash_acquired_service_wage_cents)
  );

ALTER TABLE work_records
  ADD CONSTRAINT work_records_calculated_totals
  CHECK (
    gross_fee_base_cents = main_service_amount_cents + addon_total_cents AND
    discounted_fee_performance_cents = gross_fee_base_cents - discount_total_cents AND
    total_large_fee_wage_cents = main_service_wage_cents + addon_wage_cents AND
    (total_tip_cents IS NULL OR total_tip_cents = cash_tip_cents + card_tip_cents) AND
    (actual_service_collected_cents IS NULL OR
      actual_service_collected_cents = cash_service_cents + card_service_cents) AND
    (customer_total_paid_cents IS NULL OR
      customer_total_paid_cents = actual_service_collected_cents + total_tip_cents) AND
    (employee_total_income_cents IS NULL OR
      employee_total_income_cents = total_large_fee_wage_cents + total_tip_cents)
  );

ALTER TABLE work_records
  ADD CONSTRAINT work_records_confirmed_finance_complete
  CHECK (
    status <> 'CONFIRMED' OR (
      cash_service_cents IS NOT NULL AND card_service_cents IS NOT NULL AND
      cash_tip_cents IS NOT NULL AND card_tip_cents IS NOT NULL AND
      total_tip_cents IS NOT NULL AND actual_service_collected_cents IS NOT NULL AND
      customer_total_paid_cents IS NOT NULL AND employee_total_income_cents IS NOT NULL AND
      cash_allocated_service_wage_cents IS NOT NULL AND
      cash_acquired_service_wage_cents IS NOT NULL AND cash_wage_shortfall_cents IS NOT NULL
    )
  );

ALTER TABLE work_record_service_snapshots
  ADD CONSTRAINT work_record_service_snapshots_valid_values
  CHECK (
    amount_cents >= 0 AND duration_minutes BETWEEN 1 AND 720 AND
    commission_bps BETWEEN 0 AND 10000 AND wage_cents >= 0 AND
    ((is_custom AND source_service_item_id IS NULL) OR
      (NOT is_custom AND source_service_item_id IS NOT NULL))
  );

ALTER TABLE work_record_addon_snapshots
  ADD CONSTRAINT work_record_addon_snapshots_valid_values
  CHECK (
    amount_cents >= 0 AND
    (duration_minutes IS NULL OR duration_minutes BETWEEN 0 AND 720) AND
    commission_bps BETWEEN 0 AND 10000 AND wage_cents >= 0 AND
    ((is_custom AND source_addon_item_id IS NULL) OR
      (NOT is_custom AND source_addon_item_id IS NOT NULL))
  );

ALTER TABLE work_record_discount_snapshots
  ADD CONSTRAINT work_record_discount_snapshots_valid_values
  CHECK (
    amount_cents >= 0 AND
    ((is_custom AND source_discount_item_id IS NULL) OR
      (NOT is_custom AND source_discount_item_id IS NOT NULL))
  );

ALTER TABLE payment_breakdowns
  ADD CONSTRAINT payment_breakdowns_confirmed_complete
  CHECK (
    confirmed_at IS NULL OR (
      cash_service_cents IS NOT NULL AND card_service_cents IS NOT NULL AND
      cash_tip_cents IS NOT NULL AND card_tip_cents IS NOT NULL
    )
  );

ALTER TABLE payment_breakdowns
  ADD CONSTRAINT payment_breakdowns_non_negative_money
  CHECK (
    (cash_service_cents IS NULL OR cash_service_cents >= 0) AND
    (card_service_cents IS NULL OR card_service_cents >= 0) AND
    (cash_tip_cents IS NULL OR cash_tip_cents >= 0) AND
    (card_tip_cents IS NULL OR card_tip_cents >= 0)
  );

ALTER TABLE daily_cash_settlements
  ADD CONSTRAINT daily_cash_settlements_valid_totals
  CHECK (
    cash_service_cents >= 0 AND cash_tip_cents >= 0 AND cash_received_cents >= 0 AND
    cash_allocated_service_wage_cents >= 0 AND
    cash_acquired_service_wage_cents >= 0 AND cash_wage_shortfall_cents >= 0 AND
    cash_retained_cents >= 0 AND cash_to_submit_to_store_cents >= 0 AND
    cash_received_cents = cash_service_cents + cash_tip_cents AND
    cash_retained_cents = cash_acquired_service_wage_cents + cash_tip_cents AND
    cash_to_submit_to_store_cents = cash_service_cents - cash_acquired_service_wage_cents AND
    cash_wage_shortfall_cents =
      cash_allocated_service_wage_cents - cash_acquired_service_wage_cents
  );

ALTER TABLE payroll_settlements
  ADD CONSTRAINT payroll_settlements_valid_values
  CHECK (
    period_end >= period_start AND service_wage_cents >= 0 AND
    cash_tip_cents >= 0 AND card_tip_cents >= 0 AND
    total_paid_cents = service_wage_cents + cash_tip_cents + card_tip_cents + adjustment_cents
  );

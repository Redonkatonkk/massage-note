CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME');
CREATE TYPE "DispatchKind" AS ENUM ('REGULAR', 'CLIENT_REQUESTED', 'STORE_ASSIGNED');
CREATE TYPE "DispatchIntentStatus" AS ENUM ('PENDING', 'CONSUMED', 'CANCELLED');
CREATE TYPE "DispatchMakeupStatus" AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED');

ALTER TABLE "stores"
  ADD COLUMN "automatic_dispatch_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "store_memberships"
  ADD COLUMN "employment_type" "EmploymentType";

ALTER TABLE "daily_boards"
  ADD COLUMN "ranked_at" TIMESTAMPTZ(3),
  ADD COLUMN "dispatch_sequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "daily_employee_rows"
  ADD COLUMN "normal_turns_processed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "crossed_turns" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rotation_ranked_at" TIMESTAMPTZ(3);

ALTER TABLE "work_records"
  ADD COLUMN "dispatch_kind" "DispatchKind";

CREATE TABLE "dispatch_intents" (
  "id" UUID NOT NULL,
  "board_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "employee_membership_id" UUID NOT NULL,
  "kind" "DispatchKind" NOT NULL,
  "status" "DispatchIntentStatus" NOT NULL DEFAULT 'PENDING',
  "sequence" INTEGER NOT NULL,
  "board_version" INTEGER NOT NULL,
  "work_record_id" UUID,
  "created_by" UUID NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "dispatch_intents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dispatch_makeup_turns" (
  "id" UUID NOT NULL,
  "board_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "employee_membership_id" UUID NOT NULL,
  "status" "DispatchMakeupStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "source_work_record_id" UUID,
  "consumed_work_record_id" UUID,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatch_makeup_turns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dispatch_events" (
  "id" UUID NOT NULL,
  "board_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "employee_membership_id" UUID,
  "sequence" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "detail_json" JSONB,
  "work_record_id" UUID,
  "actor_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatch_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispatch_intents_work_record_id_key" ON "dispatch_intents"("work_record_id");
CREATE INDEX "dispatch_intents_board_id_status_sequence_idx" ON "dispatch_intents"("board_id", "status", "sequence");
CREATE INDEX "dispatch_intents_store_id_employee_membership_id_status_idx" ON "dispatch_intents"("store_id", "employee_membership_id", "status");
CREATE INDEX "dispatch_makeup_turns_board_id_status_sequence_idx" ON "dispatch_makeup_turns"("board_id", "status", "sequence");
CREATE INDEX "dispatch_makeup_turns_employee_membership_id_status_idx" ON "dispatch_makeup_turns"("employee_membership_id", "status");
CREATE UNIQUE INDEX "dispatch_events_board_id_sequence_key" ON "dispatch_events"("board_id", "sequence");
CREATE INDEX "dispatch_events_store_id_created_at_idx" ON "dispatch_events"("store_id", "created_at");

ALTER TABLE "dispatch_intents" ADD CONSTRAINT "dispatch_intents_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "daily_boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_intents" ADD CONSTRAINT "dispatch_intents_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_intents" ADD CONSTRAINT "dispatch_intents_employee_membership_id_fkey" FOREIGN KEY ("employee_membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_intents" ADD CONSTRAINT "dispatch_intents_work_record_id_fkey" FOREIGN KEY ("work_record_id") REFERENCES "work_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_makeup_turns" ADD CONSTRAINT "dispatch_makeup_turns_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "daily_boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_makeup_turns" ADD CONSTRAINT "dispatch_makeup_turns_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_makeup_turns" ADD CONSTRAINT "dispatch_makeup_turns_employee_membership_id_fkey" FOREIGN KEY ("employee_membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_events" ADD CONSTRAINT "dispatch_events_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "daily_boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_events" ADD CONSTRAINT "dispatch_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_events" ADD CONSTRAINT "dispatch_events_employee_membership_id_fkey" FOREIGN KEY ("employee_membership_id") REFERENCES "store_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "daily_employee_rows" ADD CONSTRAINT "daily_employee_rows_non_negative_dispatch_state"
  CHECK ("normal_turns_processed" >= 0 AND "crossed_turns" >= 0);

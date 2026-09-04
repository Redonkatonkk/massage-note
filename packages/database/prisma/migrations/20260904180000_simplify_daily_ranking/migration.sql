-- Daily ranking no longer tracks individual dispatches or modifies work records.
DROP TABLE "dispatch_events";
DROP TABLE "dispatch_intents";
DROP TABLE "dispatch_makeup_turns";

ALTER TABLE "work_records"
  DROP COLUMN "dispatch_kind";

ALTER TABLE "daily_employee_rows"
  DROP CONSTRAINT "daily_employee_rows_non_negative_dispatch_state",
  DROP COLUMN "normal_turns_processed",
  DROP COLUMN "crossed_turns",
  DROP COLUMN "rotation_ranked_at";

ALTER TABLE "daily_boards"
  DROP COLUMN "dispatch_sequence";

DROP TYPE "DispatchKind";
DROP TYPE "DispatchIntentStatus";
DROP TYPE "DispatchMakeupStatus";

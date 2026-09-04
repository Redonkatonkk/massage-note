ALTER TABLE "dispatch_intents"
  ADD COLUMN IF NOT EXISTS "consumed_makeup_turn_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "dispatch_intents_consumed_makeup_turn_id_key"
  ON "dispatch_intents"("consumed_makeup_turn_id");

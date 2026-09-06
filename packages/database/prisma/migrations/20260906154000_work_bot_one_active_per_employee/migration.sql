CREATE UNIQUE INDEX "work_bot_member_bindings_one_active_per_membership_key"
ON "work_bot_member_bindings"("membership_id")
WHERE "active_work_record_id" IS NOT NULL;

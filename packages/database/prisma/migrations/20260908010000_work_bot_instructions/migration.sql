ALTER TABLE "stores" ADD COLUMN "work_bot_instructions" TEXT NOT NULL DEFAULT '', ADD COLUMN "work_bot_instructions_version" INTEGER NOT NULL DEFAULT 1;
UPDATE "stores" s SET "work_bot_instructions" = rules.description
FROM (SELECT a.store_id, string_agg('店里说“' || a.alias || '”时，指的是“' || i.full_name || '”；没有说明时长时，默认 ' || a.duration_minutes || ' 分钟。', E'\n' ORDER BY a.alias) AS description FROM work_bot_aliases a JOIN service_items i ON i.id = a.service_item_id WHERE a.is_enabled = true AND i.is_enabled = true AND i.deleted_at IS NULL GROUP BY a.store_id) rules WHERE rules.store_id = s.id;

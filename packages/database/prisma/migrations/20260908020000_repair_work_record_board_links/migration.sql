-- Backfill presentation metadata for records created outside the board.
-- Existing hidden rows and ordering remain intact; no financial snapshots change.
INSERT INTO daily_boards (id, store_id, business_date, updated_at)
SELECT gen_random_uuid(), store_id, business_date, CURRENT_TIMESTAMP
FROM work_records
WHERE deleted_at IS NULL
GROUP BY store_id, business_date
ON CONFLICT (store_id, business_date) DO NOTHING;

WITH missing AS (
  SELECT DISTINCT ON (b.id, w.employee_membership_id)
    b.id AS board_id, w.store_id, w.employee_membership_id AS membership_id,
    w.created_by AS added_by, w.start_at
  FROM work_records w
  JOIN daily_boards b ON b.store_id = w.store_id AND b.business_date = w.business_date
  LEFT JOIN daily_employee_rows r ON r.board_id = b.id AND r.membership_id = w.employee_membership_id
  WHERE w.deleted_at IS NULL AND r.id IS NULL
  ORDER BY b.id, w.employee_membership_id, w.start_at, w.id
), inserted AS (
  INSERT INTO daily_employee_rows (id, board_id, store_id, membership_id, position, added_by, updated_at)
  SELECT gen_random_uuid(), m.board_id, m.store_id, m.membership_id,
    COALESCE((SELECT MAX(r.position) FROM daily_employee_rows r WHERE r.board_id = m.board_id), 0)
      + ROW_NUMBER() OVER (PARTITION BY m.board_id ORDER BY m.start_at, m.membership_id),
    m.added_by, CURRENT_TIMESTAMP
  FROM missing m
  ON CONFLICT (board_id, membership_id) DO NOTHING
  RETURNING board_id
)
UPDATE daily_boards SET version = version + 1, updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT board_id FROM inserted);

-- Web confirmation/deletion/reassignment used to leave stale bot pointers.
UPDATE work_bot_member_bindings b
SET active_work_record_id = NULL, version = b.version + 1, updated_at = CURRENT_TIMESTAMP
FROM work_records w
WHERE b.active_work_record_id = w.id
  AND (w.deleted_at IS NOT NULL OR w.status <> 'PENDING_PAYMENT' OR w.employee_membership_id <> b.membership_id);

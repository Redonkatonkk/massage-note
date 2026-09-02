\set ON_ERROR_STOP on

BEGIN;

-- 固定本地演示身份。开发登录会保留现有 firebase_uid；首次执行也可独立创建账号。
INSERT INTO users (
  id, firebase_uid, phone_e164, first_name, last_name, status, created_at, updated_at
) VALUES (
  '01000000-0000-4000-8000-000000000001',
  'local-demo-7705750450',
  '+17705750450',
  '本地',
  '店主',
  'ACTIVE',
  now(),
  now()
)
ON CONFLICT (phone_e164) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  status = 'ACTIVE',
  updated_at = now();

INSERT INTO stores (
  id, store_code, name, timezone, business_cutoff_local,
  global_commission_bps, gift_card_auto_discount_enabled,
  gift_card_auto_discount_threshold_cents, gift_card_auto_discount_bps,
  gift_card_next_serial_number, closing_default_locale, status, version,
  created_at, updated_at
) VALUES (
  '10000000-0000-4000-8000-000000000001',
  '575045',
  '本地演示店',
  'America/New_York',
  '22:00',
  6000,
  true,
  10000,
  500,
  1002,
  'zh_CN',
  'ACTIVE',
  1,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  timezone = EXCLUDED.timezone,
  business_cutoff_local = EXCLUDED.business_cutoff_local,
  global_commission_bps = EXCLUDED.global_commission_bps,
  status = 'ACTIVE',
  deleted_at = NULL,
  updated_at = now();

INSERT INTO store_memberships (
  id, store_id, user_id, role, display_name, display_name_normalized,
  is_service_provider, default_commission_bps, status, joined_at, version,
  created_at, updated_at
) VALUES
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    (SELECT id FROM users WHERE phone_e164 = '+17705750450'),
    'OWNER', '测试店主', '测试店主', true, 6000, 'ACTIVE', now(), 1, now(), now()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    NULL,
    'EMPLOYEE', '小美', '小美', true, 6000, 'ACTIVE', now(), 1, now(), now()
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    NULL,
    'EMPLOYEE', '安娜', '安娜', true, 5500, 'ACTIVE', now(), 1, now(), now()
  )
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name,
  display_name_normalized = EXCLUDED.display_name_normalized,
  is_service_provider = EXCLUDED.is_service_provider,
  default_commission_bps = EXCLUDED.default_commission_bps,
  status = 'ACTIVE',
  deleted_at = NULL,
  updated_at = now();

UPDATE stores
SET owner_membership_id = '20000000-0000-4000-8000-000000000001', updated_at = now()
WHERE id = '10000000-0000-4000-8000-000000000001';

INSERT INTO service_items (
  id, store_id, full_name, short_name, duration_minutes, price_cents,
  default_commission_bps, position, is_enabled, version, created_at, updated_at
) VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60 分钟深层组织按摩', '深层', 60, 10000, 6000, 1, true, 1, now(), now()),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '60 分钟瑞典按摩', '瑞典', 60, 8000, 6000, 2, true, 1, now(), now())
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  short_name = EXCLUDED.short_name,
  duration_minutes = EXCLUDED.duration_minutes,
  price_cents = EXCLUDED.price_cents,
  default_commission_bps = EXCLUDED.default_commission_bps,
  is_enabled = true,
  deleted_at = NULL,
  updated_at = now();

INSERT INTO service_item_price_options (
  id, service_item_id, duration_minutes, price_cents, position, created_at, updated_at
) VALUES
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 60, 10000, 0, now(), now()),
  ('31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 60, 8000, 0, now(), now())
ON CONFLICT (id) DO UPDATE SET price_cents = EXCLUDED.price_cents, updated_at = now();

INSERT INTO addon_items (
  id, store_id, name, short_name, amount_cents, duration_minutes,
  default_commission_bps, position, is_enabled, version, created_at, updated_at
) VALUES (
  '32000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '热石加项', '热石', 2000, 15, 6000, 1, true, 1, now(), now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  amount_cents = EXCLUDED.amount_cents,
  duration_minutes = EXCLUDED.duration_minutes,
  is_enabled = true,
  deleted_at = NULL,
  updated_at = now();

INSERT INTO discount_items (
  id, store_id, name, short_name, amount_cents, position,
  is_enabled, version, created_at, updated_at
) VALUES
  ('33000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '演示优惠', '优惠 10', 1000, 1, true, 1, now(), now()),
  ('33000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '小额优惠', '优惠 5', 500, 2, true, 1, now(), now())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  amount_cents = EXCLUDED.amount_cents,
  is_enabled = true,
  deleted_at = NULL,
  updated_at = now();

-- 固定演示记录可安全重建；其他本地记录不受影响。
DELETE FROM work_records
WHERE id::text LIKE '50000000-0000-4000-8000-0000000000%';

WITH settings AS (
  SELECT (timezone('America/New_York', now()))::date AS demo_today
), seed (
  id, membership_id, day_offset, start_time, main_amount, addon_amount,
  discount_amount, cash_service, card_service, gift_service,
  cash_tip, card_tip, gift_tip, highlighted, note
) AS (
  VALUES
    ('50000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, -6, '09:00'::time, 10000::bigint, 2000::bigint, 1000::bigint, 5000::bigint, 6000::bigint, 0::bigint, 1000::bigint, 2000::bigint, 0::bigint, true,  '混合付款＋加项＋折扣'),
    ('50000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, -6, '11:00'::time,  8000::bigint,    0::bigint,    0::bigint,    0::bigint, 8000::bigint, 0::bigint,    0::bigint, 1500::bigint, 0::bigint, false, '纯刷卡'),
    ('50000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, -5, '10:00'::time, 10000::bigint,    0::bigint,    0::bigint,    0::bigint,    0::bigint, 10000::bigint, 0::bigint, 0::bigint, 2000::bigint, false, '礼物卡付款'),
    ('50000000-0000-4000-8000-000000000004'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, -5, '13:00'::time,  8000::bigint,    0::bigint,    0::bigint, 8000::bigint,    0::bigint,     0::bigint, 1500::bigint, 0::bigint, 0::bigint, false, '纯现金'),
    ('50000000-0000-4000-8000-000000000005'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, -4, '09:30'::time, 10000::bigint, 2000::bigint,    0::bigint, 7000::bigint, 5000::bigint,     0::bigint,  500::bigint, 1200::bigint, 0::bigint, false, '混合付款＋热石'),
    ('50000000-0000-4000-8000-000000000006'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, -4, '14:00'::time, 10000::bigint,    0::bigint, 1000::bigint,    0::bigint, 9000::bigint,     0::bigint,    0::bigint, 1800::bigint, 0::bigint, true,  '高亮折扣单'),
    ('50000000-0000-4000-8000-000000000007'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, -3, '10:00'::time,  8000::bigint, 2000::bigint,    0::bigint, 4000::bigint, 6000::bigint,     0::bigint,  800::bigint, 1200::bigint, 0::bigint, false, '两笔中的第一笔'),
    ('50000000-0000-4000-8000-000000000008'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, -3, '15:00'::time, 10000::bigint,    0::bigint,    0::bigint, 10000::bigint,   0::bigint,     0::bigint, 2000::bigint,    0::bigint, 0::bigint, false, '两笔中的第二笔'),
    ('50000000-0000-4000-8000-000000000009'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, -2, '09:00'::time,  8000::bigint,    0::bigint,  500::bigint,    0::bigint, 7500::bigint,     0::bigint,    0::bigint, 1500::bigint, 0::bigint, false, '小美刷卡单'),
    ('50000000-0000-4000-8000-000000000010'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, -2, '12:00'::time, 10000::bigint, 2000::bigint,    0::bigint,    0::bigint, 4000::bigint,  8000::bigint,    0::bigint,  800::bigint, 1000::bigint, true,  '小美礼卡混合单'),
    ('50000000-0000-4000-8000-000000000011'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, -1, '10:30'::time, 10000::bigint,    0::bigint,    0::bigint, 6000::bigint, 4000::bigint,     0::bigint, 1000::bigint, 1000::bigint, 0::bigint, false, '小美混合付款'),
    ('50000000-0000-4000-8000-000000000012'::uuid, '20000000-0000-4000-8000-000000000003'::uuid, -1, '14:30'::time,  8000::bigint, 2000::bigint,    0::bigint, 10000::bigint,   0::bigint,     0::bigint, 1800::bigint,    0::bigint, 0::bigint, false, '安娜现金加项单')
), calculated AS (
  SELECT
    seed.*,
    settings.demo_today + seed.day_offset AS business_date,
    seed.main_amount + seed.addon_amount AS gross_amount,
    seed.main_amount + seed.addon_amount - seed.discount_amount AS performance_amount,
    seed.cash_service + seed.card_service + seed.gift_service AS collected_amount,
    seed.cash_tip + seed.card_tip + seed.gift_tip AS total_tip,
    (seed.main_amount * 6000 / 10000) AS main_wage,
    (seed.addon_amount * 6000 / 10000) AS addon_wage
  FROM seed CROSS JOIN settings
), final AS (
  SELECT
    calculated.*,
    main_wage + addon_wage AS total_wage,
    CASE WHEN collected_amount = 0 THEN 0
      ELSE round(((main_wage + addon_wage) * cash_service)::numeric / collected_amount)::bigint
    END AS cash_allocated_wage
  FROM calculated
)
INSERT INTO work_records (
  id, store_id, employee_membership_id, business_date,
  store_timezone_snapshot, business_cutoff_snapshot, start_at, end_at,
  actual_duration_minutes, status, main_service_amount_cents, addon_total_cents,
  gross_fee_base_cents, discount_total_cents, discounted_fee_performance_cents,
  cash_service_cents, card_service_cents, gift_card_serial_number,
  gift_card_service_cents, cash_tip_cents, card_tip_cents, gift_card_tip_cents,
  total_tip_cents, actual_service_collected_cents, customer_total_paid_cents,
  payment_difference_cents, main_service_wage_cents, addon_wage_cents,
  total_large_fee_wage_cents, employee_total_income_cents,
  cash_allocated_service_wage_cents, cash_acquired_service_wage_cents,
  cash_wage_shortfall_cents, is_highlighted, note, version,
  created_by, updated_by, created_at, updated_at
)
SELECT
  final.id,
  '10000000-0000-4000-8000-000000000001',
  final.membership_id,
  final.business_date,
  'America/New_York',
  '22:00',
  ((final.business_date + final.start_time) AT TIME ZONE 'America/New_York'),
  ((final.business_date + final.start_time + interval '60 minutes' + CASE WHEN final.addon_amount > 0 THEN interval '15 minutes' ELSE interval '0 minutes' END) AT TIME ZONE 'America/New_York'),
  60 + CASE WHEN final.addon_amount > 0 THEN 15 ELSE 0 END,
  'CONFIRMED',
  final.main_amount,
  final.addon_amount,
  final.gross_amount,
  final.discount_amount,
  final.performance_amount,
  final.cash_service,
  final.card_service,
  CASE WHEN final.gift_service + final.gift_tip > 0 THEN 'DEMO-GC-1001' ELSE NULL END,
  final.gift_service,
  final.cash_tip,
  final.card_tip,
  final.gift_tip,
  final.total_tip,
  final.collected_amount,
  final.collected_amount + final.total_tip,
  final.collected_amount - final.performance_amount,
  final.main_wage,
  final.addon_wage,
  final.total_wage,
  final.total_wage + final.total_tip,
  final.cash_allocated_wage,
  LEAST(final.cash_service, final.cash_allocated_wage),
  final.cash_allocated_wage - LEAST(final.cash_service, final.cash_allocated_wage),
  final.highlighted,
  final.note,
  1,
  (SELECT id FROM users WHERE phone_e164 = '+17705750450'),
  (SELECT id FROM users WHERE phone_e164 = '+17705750450'),
  now(),
  now()
FROM final;

INSERT INTO work_record_service_snapshots (
  id, work_record_id, source_service_item_id, is_custom, name, short_name,
  amount_cents, duration_minutes, commission_bps, commission_source, wage_cents
)
SELECT
  md5(work.id::text || ':service')::uuid,
  work.id,
  CASE WHEN work.main_service_amount_cents = 10000
    THEN '30000000-0000-4000-8000-000000000001'::uuid
    ELSE '30000000-0000-4000-8000-000000000002'::uuid END,
  false,
  CASE WHEN work.main_service_amount_cents = 10000 THEN '60 分钟深层组织按摩' ELSE '60 分钟瑞典按摩' END,
  CASE WHEN work.main_service_amount_cents = 10000 THEN '深层' ELSE '瑞典' END,
  work.main_service_amount_cents,
  60,
  6000,
  'service_default',
  work.main_service_wage_cents
FROM work_records work
WHERE work.id::text LIKE '50000000-0000-4000-8000-0000000000%';

INSERT INTO work_record_addon_snapshots (
  id, work_record_id, source_addon_item_id, is_custom, name, short_name,
  amount_cents, duration_minutes, commission_bps, commission_source,
  wage_cents, position
)
SELECT
  md5(work.id::text || ':addon')::uuid,
  work.id,
  '32000000-0000-4000-8000-000000000001',
  false,
  '热石加项',
  '热石',
  work.addon_total_cents,
  15,
  6000,
  'addon_default',
  work.addon_wage_cents,
  1
FROM work_records work
WHERE work.id::text LIKE '50000000-0000-4000-8000-0000000000%'
  AND work.addon_total_cents > 0;

INSERT INTO work_record_discount_snapshots (
  id, work_record_id, source_discount_item_id, is_custom, is_automatic,
  name, amount_cents, position
)
SELECT
  md5(work.id::text || ':discount')::uuid,
  work.id,
  CASE WHEN work.discount_total_cents = 1000
    THEN '33000000-0000-4000-8000-000000000001'::uuid
    ELSE '33000000-0000-4000-8000-000000000002'::uuid END,
  false,
  false,
  CASE WHEN work.discount_total_cents = 1000 THEN '演示优惠' ELSE '小额优惠' END,
  work.discount_total_cents,
  1
FROM work_records work
WHERE work.id::text LIKE '50000000-0000-4000-8000-0000000000%'
  AND work.discount_total_cents > 0;

INSERT INTO payment_breakdowns (
  id, work_record_id, cash_service_cents, card_service_cents,
  gift_card_serial_number, gift_card_service_cents, cash_tip_cents,
  card_tip_cents, gift_card_tip_cents, confirmed_at, confirmed_by,
  version, created_at, updated_at
)
SELECT
  md5(work.id::text || ':payment')::uuid,
  work.id,
  work.cash_service_cents,
  work.card_service_cents,
  work.gift_card_serial_number,
  work.gift_card_service_cents,
  work.cash_tip_cents,
  work.card_tip_cents,
  work.gift_card_tip_cents,
  now(),
  (SELECT id FROM users WHERE phone_e164 = '+17705750450'),
  1,
  now(),
  now()
FROM work_records work
WHERE work.id::text LIKE '50000000-0000-4000-8000-0000000000%';

INSERT INTO gift_card_sales (
  id, store_id, business_date, serial_number, serial_number_normalized,
  face_value_cents, discount_threshold_cents, discount_rate_bps,
  discount_cents, cash_cents, card_cents, amount_cents,
  operator_membership_id, version, created_by, updated_by, created_at, updated_at
)
SELECT
  '60000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  (timezone('America/New_York', now()))::date - 7,
  'DEMO-GC-1001',
  'demo-gc-1001',
  20000,
  10000,
  500,
  1000,
  10000,
  9000,
  19000,
  '20000000-0000-4000-8000-000000000001',
  1,
  (SELECT id FROM users WHERE phone_e164 = '+17705750450'),
  (SELECT id FROM users WHERE phone_e164 = '+17705750450'),
  now(),
  now()
ON CONFLICT (id) DO UPDATE SET
  business_date = EXCLUDED.business_date,
  deleted_at = NULL,
  updated_at = now();

-- 今日表格跟随执行日期重建，方便每次打开本地系统都能看到演示成员。
DELETE FROM daily_employee_rows
WHERE store_id = '10000000-0000-4000-8000-000000000001';
DELETE FROM daily_boards
WHERE store_id = '10000000-0000-4000-8000-000000000001';

WITH settings AS (
  SELECT (timezone('America/New_York', now()))::date AS demo_today
), boards (id, day_offset) AS (
  VALUES
    ('70000000-0000-4000-8000-000000000001'::uuid, -6),
    ('70000000-0000-4000-8000-000000000002'::uuid, -5),
    ('70000000-0000-4000-8000-000000000003'::uuid, -4),
    ('70000000-0000-4000-8000-000000000004'::uuid, -3),
    ('70000000-0000-4000-8000-000000000005'::uuid, -2),
    ('70000000-0000-4000-8000-000000000006'::uuid, -1),
    ('70000000-0000-4000-8000-000000000007'::uuid,  0)
)
INSERT INTO daily_boards (id, store_id, business_date, version, created_at, updated_at)
SELECT board.id, '10000000-0000-4000-8000-000000000001', settings.demo_today + board.day_offset, 1, now(), now()
FROM boards board CROSS JOIN settings;

INSERT INTO daily_employee_rows (
  id, board_id, store_id, membership_id, position, is_hidden,
  added_by, version, created_at, updated_at
)
SELECT
  md5(board.id::text || ':' || member.id::text)::uuid,
  board.id,
  board.store_id,
  member.id,
  CASE member.role WHEN 'OWNER' THEN 1 WHEN 'MANAGER' THEN 2 ELSE 10 END
    + CASE member.id
      WHEN '20000000-0000-4000-8000-000000000002'::uuid THEN 0
      ELSE 1 END,
  false,
  (SELECT id FROM users WHERE phone_e164 = '+17705750450'),
  1,
  now(),
  now()
FROM daily_boards board
CROSS JOIN store_memberships member
WHERE board.store_id = '10000000-0000-4000-8000-000000000001'
  AND member.store_id = board.store_id
  AND member.status = 'ACTIVE'
  AND member.deleted_at IS NULL;

COMMIT;

SELECT
  '+1 (770) 575-0450' AS login_phone,
  stores.name AS store,
  count(DISTINCT work_records.id) AS confirmed_records,
  count(DISTINCT work_records.business_date) AS record_days
FROM stores
LEFT JOIN work_records ON work_records.store_id = stores.id AND work_records.deleted_at IS NULL
WHERE stores.id = '10000000-0000-4000-8000-000000000001'
GROUP BY stores.name;

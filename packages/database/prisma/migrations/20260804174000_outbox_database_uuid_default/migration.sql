ALTER TABLE domain_outbox
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- PostgreSQL CHECK permits NULL results. Explicitly require the one-time amount.
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_once_amount_required"
  CHECK ("kind" <> 'ONCE' OR "amount_cents" IS NOT NULL);

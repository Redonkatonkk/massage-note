ALTER TABLE "lost_customers" ADD COLUMN "customer_count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "lost_customers" ADD CONSTRAINT "lost_customers_customer_count_check" CHECK ("customer_count" BETWEEN 1 AND 999);

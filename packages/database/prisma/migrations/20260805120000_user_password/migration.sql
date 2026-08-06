-- Existing users remain passwordless until their next verified SMS login.
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;

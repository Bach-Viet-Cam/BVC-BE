-- Rollback for 20261015000000_m03_classes_members (Prisma does not generate down migrations).
-- Run manually: psql "$DATABASE_URL" -f down.sql
-- then: DELETE FROM "_prisma_migrations" WHERE migration_name = '20261015000000_m03_classes_members';
DROP INDEX IF EXISTS "users_lower_email_key";
DROP TABLE IF EXISTS "audit_logs";
DROP TABLE IF EXISTS "class_members";
DROP TABLE IF EXISTS "student_import_logs";
DROP TABLE IF EXISTS "classes";
DROP TABLE IF EXISTS "instruments";
DROP INDEX IF EXISTS "users_student_code_key";
ALTER TABLE "users" DROP COLUMN IF EXISTS "student_code", DROP COLUMN IF EXISTS "status";
DROP TYPE IF EXISTS "ImportLogStatus";
DROP TYPE IF EXISTS "ClassMemberSource";
DROP TYPE IF EXISTS "ClassStatus";
DROP TYPE IF EXISTS "UserStatus";

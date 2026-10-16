-- Rollback for 20261017000000_m03_assignments (Prisma does not generate down migrations).
-- Run manually: psql "$DATABASE_URL" -f down.sql
-- then: DELETE FROM "_prisma_migrations" WHERE migration_name = '20261017000000_m03_assignments';
DROP TABLE IF EXISTS "submission_comments";
DROP TABLE IF EXISTS "submissions";
ALTER TABLE IF EXISTS "assignments" DROP CONSTRAINT IF EXISTS "assignments_current_version_id_fkey";
DROP TABLE IF EXISTS "assignment_versions";
DROP TABLE IF EXISTS "assignments";
DROP TABLE IF EXISTS "notifications";
DROP TABLE IF EXISTS "system_settings";
DROP TYPE IF EXISTS "SubmissionStatus";
DROP TYPE IF EXISTS "AssignmentKind";
DROP TYPE IF EXISTS "AssignmentStatus";

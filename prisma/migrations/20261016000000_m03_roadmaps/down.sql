-- Rollback for 20261016000000_m03_roadmaps (Prisma does not generate down migrations).
-- Run manually: psql "$DATABASE_URL" -f down.sql
-- then: DELETE FROM "_prisma_migrations" WHERE migration_name = '20261016000000_m03_roadmaps';
ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_roadmap_id_fkey";
DROP INDEX IF EXISTS "classes_roadmap_id_idx";
ALTER TABLE "classes" DROP COLUMN IF EXISTS "roadmap_id";
DROP TABLE IF EXISTS "roadmap_week_exercises";
DROP TABLE IF EXISTS "roadmap_weeks";
DROP TABLE IF EXISTS "roadmaps";
DROP TABLE IF EXISTS "pieces";
DROP TYPE IF EXISTS "PieceKind";

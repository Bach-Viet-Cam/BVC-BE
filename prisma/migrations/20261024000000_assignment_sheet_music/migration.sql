-- Assignments now point at a sheet music instead of a piece.
-- Generated with `prisma migrate diff`, then reordered so existing rows keep their music:
-- add sheet_music_id, backfill it from piece_id, and only then drop piece_id.
-- Backfill picks the piece's sheet for the class instrument, else its oldest sheet (same rule as the seeders).

-- DropForeignKey
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_piece_id_fkey";

-- DropForeignKey
ALTER TABLE "assignment_versions" DROP CONSTRAINT "assignment_versions_piece_id_fkey";

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "sheet_music_id" TEXT;

-- AlterTable
ALTER TABLE "assignment_versions" ADD COLUMN     "sheet_music_id" TEXT;

-- Backfill
UPDATE "assignments" a SET "sheet_music_id" = (
  SELECT s."id" FROM "sheet_music" s
  JOIN "classes" c ON c."id" = a."class_id"
  WHERE s."piece_id" = a."piece_id"
  ORDER BY (s."instrument_id" = c."instrument_id") DESC, s."created_at" ASC
  LIMIT 1
) WHERE a."piece_id" IS NOT NULL;

-- Backfill
UPDATE "assignment_versions" v SET "sheet_music_id" = (
  SELECT s."id" FROM "sheet_music" s
  JOIN "assignments" a ON a."id" = v."assignment_id"
  JOIN "classes" c ON c."id" = a."class_id"
  WHERE s."piece_id" = v."piece_id"
  ORDER BY (s."instrument_id" = c."instrument_id") DESC, s."created_at" ASC
  LIMIT 1
) WHERE v."piece_id" IS NOT NULL;

-- AlterTable
ALTER TABLE "assignments" DROP COLUMN "piece_id";

-- AlterTable
ALTER TABLE "assignment_versions" DROP COLUMN "piece_id";

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_sheet_music_id_fkey" FOREIGN KEY ("sheet_music_id") REFERENCES "sheet_music"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_sheet_music_id_fkey" FOREIGN KEY ("sheet_music_id") REFERENCES "sheet_music"("id") ON DELETE SET NULL ON UPDATE CASCADE;

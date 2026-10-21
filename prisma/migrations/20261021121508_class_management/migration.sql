/*
  Warnings:

  - A unique constraint covering the columns `[current_version_id]` on the table `assignments` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PieceKind" AS ENUM ('FINGER_EXERCISE', 'SONG');

-- CreateEnum
CREATE TYPE "ClassMemberSource" AS ENUM ('IMPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImportLogStatus" AS ENUM ('PREVIEW', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('SOLO', 'ENSEMBLE', 'BONUS', 'OTHER');

-- DropIndex
DROP INDEX "assignments_class_id_idx";

-- DropIndex
DROP INDEX "class_members_class_id_user_id_key";

-- DropIndex
DROP INDEX "classes_owner_id_idx";

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "current_version_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "status" "AssignmentStatus" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "class_members" ADD COLUMN     "added_by" TEXT,
ADD COLUMN     "import_log_id" TEXT,
ADD COLUMN     "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "removed_at" TIMESTAMP(3),
ADD COLUMN     "removed_by" TEXT,
ADD COLUMN     "source" "ClassMemberSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "cohort" VARCHAR(50) NOT NULL DEFAULT '',
ADD COLUMN     "description" VARCHAR(500),
ADD COLUMN     "end_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "ended_at" TIMESTAMP(3),
ADD COLUMN     "roadmap_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "link" TEXT;

-- AlterTable
ALTER TABLE "pieces" ADD COLUMN     "kind" "PieceKind" NOT NULL DEFAULT 'SONG';

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "analyzed_at" TIMESTAMP(3),
ADD COLUMN     "assignment_version_id" TEXT,
ADD COLUMN     "tempo_deviation" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "student_import_logs" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "lecturer_id" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_type" VARCHAR(10) NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "valid_rows" INTEGER NOT NULL,
    "error_rows" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,
    "status" "ImportLogStatus" NOT NULL DEFAULT 'PREVIEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "student_import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmaps" (
    "id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roadmaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_weeks" (
    "id" TEXT NOT NULL,
    "roadmap_id" TEXT NOT NULL,
    "week_number" SMALLINT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "content" VARCHAR(1000) NOT NULL,

    CONSTRAINT "roadmap_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_week_exercises" (
    "id" TEXT NOT NULL,
    "roadmap_week_id" TEXT NOT NULL,
    "piece_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "roadmap_week_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_versions" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "kind" "AssignmentKind" NOT NULL,
    "piece_id" TEXT,
    "required_bpm" INTEGER,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_comments" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "lecturer_id" TEXT NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submission_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roadmaps_instrument_id_version_key" ON "roadmaps"("instrument_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_weeks_roadmap_id_week_number_key" ON "roadmap_weeks"("roadmap_id", "week_number");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_week_exercises_roadmap_week_id_sort_order_key" ON "roadmap_week_exercises"("roadmap_week_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_week_exercises_roadmap_week_id_piece_id_key" ON "roadmap_week_exercises"("roadmap_week_id", "piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_versions_assignment_id_version_key" ON "assignment_versions"("assignment_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "submission_comments_submission_id_key" ON "submission_comments"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_current_version_id_key" ON "assignments"("current_version_id");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_import_log_id_fkey" FOREIGN KEY ("import_log_id") REFERENCES "student_import_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_import_logs" ADD CONSTRAINT "student_import_logs_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_import_logs" ADD CONSTRAINT "student_import_logs_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_weeks" ADD CONSTRAINT "roadmap_weeks_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_week_exercises" ADD CONSTRAINT "roadmap_week_exercises_roadmap_week_id_fkey" FOREIGN KEY ("roadmap_week_id") REFERENCES "roadmap_weeks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_week_exercises" ADD CONSTRAINT "roadmap_week_exercises_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "assignment_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_version_id_fkey" FOREIGN KEY ("assignment_version_id") REFERENCES "assignment_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

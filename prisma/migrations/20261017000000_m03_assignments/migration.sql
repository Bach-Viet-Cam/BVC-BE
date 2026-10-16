-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('SOLO', 'ENSEMBLE', 'BONUS', 'OTHER');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" VARCHAR(500) NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "link" VARCHAR(300) NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version_id" TEXT,
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "assignment_version_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "audio_url" VARCHAR(500) NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PROCESSING',
    "accuracy" DECIMAL(5,2),
    "tempo_deviation" DECIMAL(6,2),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzed_at" TIMESTAMP(3),

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "system_settings_updated_by_idx" ON "system_settings"("updated_by");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_current_version_id_key" ON "assignments"("current_version_id");

-- CreateIndex
CREATE INDEX "assignments_class_id_status_idx" ON "assignments"("class_id", "status");

-- CreateIndex
CREATE INDEX "assignments_created_by_idx" ON "assignments"("created_by");

-- CreateIndex
CREATE INDEX "assignment_versions_piece_id_idx" ON "assignment_versions"("piece_id");

-- CreateIndex
CREATE INDEX "assignment_versions_created_by_idx" ON "assignment_versions"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_versions_assignment_id_version_key" ON "assignment_versions"("assignment_id", "version");

-- CreateIndex
CREATE INDEX "submissions_assignment_id_student_id_idx" ON "submissions"("assignment_id", "student_id");

-- CreateIndex
CREATE INDEX "submissions_class_id_student_id_idx" ON "submissions"("class_id", "student_id");

-- CreateIndex
CREATE INDEX "submissions_assignment_version_id_idx" ON "submissions"("assignment_version_id");

-- CreateIndex
CREATE INDEX "submissions_student_id_idx" ON "submissions"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_comments_submission_id_key" ON "submission_comments"("submission_id");

-- CreateIndex
CREATE INDEX "submission_comments_lecturer_id_idx" ON "submission_comments"("lecturer_id");

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "assignment_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_version_id_fkey" FOREIGN KEY ("assignment_version_id") REFERENCES "assignment_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Manual: initial grading thresholds (user decision 16/10: admin-configurable, not hardcoded in code)
INSERT INTO "system_settings" ("key", "value", "updated_at") VALUES
  ('grading.minAccuracy', '70', CURRENT_TIMESTAMP),
  ('grading.atRiskMargin', '40', CURRENT_TIMESTAMP);

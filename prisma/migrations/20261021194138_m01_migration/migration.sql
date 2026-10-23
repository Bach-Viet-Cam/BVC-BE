/*
  Warnings:

  - A unique constraint covering the columns `[evaluation_id]` on the table `submissions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[message_id]` on the table `submissions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `piece_id` to the `submissions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SubmissionStage" AS ENUM ('QUALITY_CHECK', 'AUDIO_ANALYSIS', 'COMPARISON', 'FEEDBACK');

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "ai_feedback" TEXT,
ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "error_code" TEXT,
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "evaluation_id" TEXT,
ADD COLUMN     "file_deleted_at" TIMESTAMP(3),
ADD COLUMN     "message_id" TEXT,
ADD COLUMN     "piece_id" TEXT NOT NULL,
ADD COLUMN     "publication_state" TEXT,
ADD COLUMN     "reject_reason" TEXT,
ADD COLUMN     "result" JSONB,
ADD COLUMN     "retry_available_at" TIMESTAMP(3),
ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sheet_music_id" TEXT,
ADD COLUMN     "stage" "SubmissionStage",
ADD COLUMN     "stage_started_at" TIMESTAMP(3),
ADD COLUMN     "student_upload_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "assignment_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "submissions_evaluation_id_key" ON "submissions"("evaluation_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_message_id_key" ON "submissions"("message_id");

-- CreateIndex
CREATE INDEX "submissions_student_id_piece_id_status_idx" ON "submissions"("student_id", "piece_id", "status");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_sheet_music_id_fkey" FOREIGN KEY ("sheet_music_id") REFERENCES "sheet_music"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_upload_id_fkey" FOREIGN KEY ("student_upload_id") REFERENCES "audio_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

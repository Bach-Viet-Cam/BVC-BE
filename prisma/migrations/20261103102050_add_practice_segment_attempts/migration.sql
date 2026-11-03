-- CreateTable
CREATE TABLE "practice_segment_attempts" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "start_sec" DOUBLE PRECISION NOT NULL,
    "end_sec" DOUBLE PRECISION NOT NULL,
    "student_upload_id" TEXT,
    "file_url" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PROCESSING',
    "stage" "SubmissionStage",
    "stage_started_at" TIMESTAMP(3),
    "evaluation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "publication_state" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "result" JSONB,
    "ai_feedback" TEXT,
    "accuracy" DOUBLE PRECISION,
    "pitch_accuracy" DOUBLE PRECISION,
    "rhythm_accuracy" DOUBLE PRECISION,
    "baseline_accuracy" DOUBLE PRECISION,
    "baseline_pitch" DOUBLE PRECISION,
    "baseline_rhythm" DOUBLE PRECISION,
    "reject_reason" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "analyzed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_segment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "practice_segment_attempts_evaluation_id_key" ON "practice_segment_attempts"("evaluation_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_segment_attempts_message_id_key" ON "practice_segment_attempts"("message_id");

-- CreateIndex
CREATE INDEX "practice_segment_attempts_submission_id_created_at_idx" ON "practice_segment_attempts"("submission_id", "created_at");

-- CreateIndex
CREATE INDEX "practice_segment_attempts_student_id_created_at_idx" ON "practice_segment_attempts"("student_id", "created_at");

-- AddForeignKey
ALTER TABLE "practice_segment_attempts" ADD CONSTRAINT "practice_segment_attempts_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_segment_attempts" ADD CONSTRAINT "practice_segment_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_segment_attempts" ADD CONSTRAINT "practice_segment_attempts_student_upload_id_fkey" FOREIGN KEY ("student_upload_id") REFERENCES "audio_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "LecturerReviewStatus" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerifiedPublicationStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'REVOKED');

-- AlterTable
ALTER TABLE "pieces" ADD COLUMN     "level_id" TEXT;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "consent_updated_at" TIMESTAMP(3),
ADD COLUMN     "share_consent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "faqs" (
    "id" TEXT NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "question_key" VARCHAR(300) NOT NULL,
    "answer" TEXT NOT NULL,
    "topic" VARCHAR(30) NOT NULL,
    "instrument_id" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_reviews" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "status" "LecturerReviewStatus" NOT NULL,
    "reviewed_by_id" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(2000),

    CONSTRAINT "submission_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verified_contents" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "piece_id" TEXT NOT NULL,
    "source_sheet_music_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "source_class_id" TEXT NOT NULL,
    "source_class_name" TEXT NOT NULL,
    "cohort" TEXT NOT NULL DEFAULT '',
    "verified_by_id" TEXT NOT NULL,
    "verified_by_name" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accuracy" DOUBLE PRECISION,
    "tempo_deviation" DOUBLE PRECISION,
    "audio_upload_id" TEXT NOT NULL,
    "status" "VerifiedPublicationStatus" NOT NULL DEFAULT 'HIDDEN',
    "reason" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verified_contents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "faqs_is_active_topic_display_order_idx" ON "faqs"("is_active", "topic", "display_order");

-- CreateIndex
CREATE INDEX "faqs_instrument_id_idx" ON "faqs"("instrument_id");

-- CreateIndex
CREATE UNIQUE INDEX "faqs_topic_question_key_key" ON "faqs"("topic", "question_key");

-- CreateIndex
CREATE UNIQUE INDEX "submission_reviews_submission_id_key" ON "submission_reviews"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "verified_contents_submission_id_key" ON "verified_contents"("submission_id");

-- CreateIndex
CREATE INDEX "verified_contents_piece_id_instrument_id_status_verified_at_idx" ON "verified_contents"("piece_id", "instrument_id", "status", "verified_at");

-- CreateIndex
CREATE INDEX "verified_contents_source_class_id_status_idx" ON "verified_contents"("source_class_id", "status");

-- CreateIndex
CREATE INDEX "verified_contents_audio_upload_id_idx" ON "verified_contents"("audio_upload_id");

-- CreateIndex
CREATE INDEX "verified_contents_cohort_idx" ON "verified_contents"("cohort");

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_contents" ADD CONSTRAINT "verified_contents_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_contents" ADD CONSTRAINT "verified_contents_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_contents" ADD CONSTRAINT "verified_contents_source_sheet_music_id_fkey" FOREIGN KEY ("source_sheet_music_id") REFERENCES "sheet_music"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_contents" ADD CONSTRAINT "verified_contents_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_contents" ADD CONSTRAINT "verified_contents_source_class_id_fkey" FOREIGN KEY ("source_class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_contents" ADD CONSTRAINT "verified_contents_audio_upload_id_fkey" FOREIGN KEY ("audio_upload_id") REFERENCES "audio_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

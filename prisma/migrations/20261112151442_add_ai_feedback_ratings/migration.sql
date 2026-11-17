CREATE TABLE "ai_feedback_ratings" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "rater_id" TEXT NOT NULL,
    "rater_name" TEXT NOT NULL,
    "rater_role" INTEGER NOT NULL,
    "feedback_key" TEXT NOT NULL,
    "feedback_text" TEXT NOT NULL,
    "accuracy_stars" INTEGER NOT NULL,
    "satisfaction_stars" INTEGER NOT NULL,
    "comment" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_feedback_ratings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_feedback_ratings_created_at_id_idx" ON "ai_feedback_ratings"("created_at", "id");

CREATE UNIQUE INDEX "ai_feedback_ratings_submission_id_rater_id_feedback_key_key" ON "ai_feedback_ratings"("submission_id", "rater_id", "feedback_key");

ALTER TABLE "ai_feedback_ratings" ADD CONSTRAINT "ai_feedback_ratings_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_feedback_ratings" ADD CONSTRAINT "ai_feedback_ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

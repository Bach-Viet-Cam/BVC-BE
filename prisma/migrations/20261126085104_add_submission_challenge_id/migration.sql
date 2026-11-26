-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "challenge_id" TEXT;

-- CreateIndex
CREATE INDEX "submissions_challenge_id_student_id_idx" ON "submissions"("challenge_id", "student_id");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

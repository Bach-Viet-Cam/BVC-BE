-- Hòa tấu nộp bài qua submissions (practice_mode = ENSEMBLE); bỏ ensemble_sessions (dữ liệu dev, không chuyển).

-- CreateEnum
CREATE TYPE "PracticeMode" AS ENUM ('SOLO', 'ENSEMBLE');

-- DropForeignKey
ALTER TABLE "ensemble_sessions" DROP CONSTRAINT "ensemble_sessions_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ensemble_sessions" DROP CONSTRAINT "ensemble_sessions_piece_id_fkey";

-- DropForeignKey
ALTER TABLE "ensemble_sessions" DROP CONSTRAINT "ensemble_sessions_instrument_id_fkey";

-- DropForeignKey
ALTER TABLE "ensemble_sessions" DROP CONSTRAINT "ensemble_sessions_assignment_id_fkey";

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "practice_mode" "PracticeMode" NOT NULL DEFAULT 'SOLO';

-- DropTable
DROP TABLE "ensemble_sessions";

-- DropEnum
DROP TYPE "EnsembleSessionStatus";


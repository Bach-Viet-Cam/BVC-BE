-- CreateEnum
CREATE TYPE "PieceKind" AS ENUM ('FINGER_EXERCISE', 'SONG');

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "roadmap_id" TEXT;

-- CreateTable
CREATE TABLE "pieces" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "kind" "PieceKind" NOT NULL,
    "default_bpm" INTEGER,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pieces_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "pieces_instrument_id_kind_is_visible_idx" ON "pieces"("instrument_id", "kind", "is_visible");

-- CreateIndex
CREATE INDEX "pieces_created_by_idx" ON "pieces"("created_by");

-- CreateIndex
CREATE INDEX "roadmaps_created_by_idx" ON "roadmaps"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "roadmaps_instrument_id_version_key" ON "roadmaps"("instrument_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_weeks_roadmap_id_week_number_key" ON "roadmap_weeks"("roadmap_id", "week_number");

-- CreateIndex
CREATE INDEX "roadmap_week_exercises_piece_id_idx" ON "roadmap_week_exercises"("piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_week_exercises_roadmap_week_id_sort_order_key" ON "roadmap_week_exercises"("roadmap_week_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_week_exercises_roadmap_week_id_piece_id_key" ON "roadmap_week_exercises"("roadmap_week_id", "piece_id");

-- CreateIndex
CREATE INDEX "classes_roadmap_id_idx" ON "classes"("roadmap_id");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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


-- Manual: Prisma cannot express CHECK constraints
ALTER TABLE "roadmap_weeks" ADD CONSTRAINT "roadmap_weeks_week_number_check" CHECK ("week_number" BETWEEN 1 AND 6);

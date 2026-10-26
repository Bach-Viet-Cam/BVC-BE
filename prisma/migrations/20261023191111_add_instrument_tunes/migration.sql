-- CreateTable
CREATE TABLE "instrument_tunes" (
    "tune_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "tune_name" TEXT NOT NULL,
    "pitch" DOUBLE PRECISION NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instrument_tunes_pkey" PRIMARY KEY ("tune_id")
);

-- CreateIndex
CREATE INDEX "instrument_tunes_instrument_id_idx" ON "instrument_tunes"("instrument_id");

-- AddForeignKey
ALTER TABLE "instrument_tunes" ADD CONSTRAINT "instrument_tunes_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

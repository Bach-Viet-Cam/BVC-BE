-- DropForeignKey
ALTER TABLE "ensemble_tracks" DROP CONSTRAINT IF EXISTS "ensemble_tracks_instrument_id_fkey";

-- DropForeignKey
ALTER TABLE "ensemble_tracks" DROP CONSTRAINT IF EXISTS "ensemble_tracks_piece_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "ensemble_tracks";

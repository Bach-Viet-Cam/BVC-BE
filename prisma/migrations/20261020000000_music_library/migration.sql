-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('GENRE', 'LEVEL');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'HIDDEN');

-- CreateEnum
CREATE TYPE "Moderation" AS ENUM ('NORMAL', 'ADMIN_HIDDEN');

-- CreateEnum
CREATE TYPE "SheetKind" AS ENUM ('MAIN', 'LEVEL');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('NONE', 'PROCESSING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('COVER', 'SHEET', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY');

-- CreateEnum
CREATE TYPE "SavedTargetType" AS ENUM ('PIECE', 'SHEET_MUSIC');

-- AlterTable
ALTER TABLE "instruments" ADD COLUMN     "fmax_hz" DOUBLE PRECISION NOT NULL DEFAULT 2000,
ADD COLUMN     "fmin_hz" DOUBLE PRECISION NOT NULL DEFAULT 80,
ADD COLUMN     "tolerance_cents" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "pieces" ADD COLUMN     "composer_normalized" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cover_file_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "description" VARCHAR(1000),
ADD COLUMN     "genre_id" TEXT,
ADD COLUMN     "level_id" TEXT,
ADD COLUMN     "moderation" "Moderation" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "moderation_reason" TEXT,
ADD COLUMN     "owner_id" TEXT,
ADD COLUMN     "search_text" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "title_normalized" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "visibility" "Visibility" NOT NULL DEFAULT 'HIDDEN',
ALTER COLUMN "title" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "composer" SET DATA TYPE VARCHAR(200);

-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_file" (
    "id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "duration_sec" INTEGER,
    "page_count" INTEGER,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "piece_instrument" (
    "piece_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "piece_instrument_pkey" PRIMARY KEY ("piece_id","instrument_id")
);

-- CreateTable
CREATE TABLE "sheet_music" (
    "id" TEXT NOT NULL,
    "piece_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "kind" "SheetKind" NOT NULL,
    "main_instrument_id" TEXT,
    "name" VARCHAR(100) NOT NULL,
    "level_id" TEXT NOT NULL,
    "description" VARCHAR(500),
    "sheet_file_id" TEXT NOT NULL,
    "reference_audio_id" TEXT,
    "tutorial_video_id" TEXT,
    "duration_sec" INTEGER,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "moderation" "Moderation" NOT NULL DEFAULT 'NORMAL',
    "analysis_status" "AnalysisStatus" NOT NULL DEFAULT 'NONE',
    "analysis_file_url" TEXT,
    "analysis_error" TEXT,
    "analysis_job_id" TEXT,
    "time_signature_missing" BOOLEAN NOT NULL DEFAULT false,
    "uploader_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_music_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_item" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "target_type" "SavedTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "piece_id" TEXT,
    "sheet_music_id" TEXT,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_type_name_key" ON "category"("type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "media_file_storage_key_key" ON "media_file"("storage_key");

-- CreateIndex
CREATE INDEX "media_file_uploaded_by_idx" ON "media_file"("uploaded_by");

-- CreateIndex
CREATE INDEX "sheet_music_piece_id_instrument_id_idx" ON "sheet_music"("piece_id", "instrument_id");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_music_piece_id_name_key" ON "sheet_music"("piece_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_music_piece_id_main_instrument_id_key" ON "sheet_music"("piece_id", "main_instrument_id");

-- CreateIndex
CREATE INDEX "saved_item_student_id_saved_at_idx" ON "saved_item"("student_id", "saved_at");

-- CreateIndex
CREATE UNIQUE INDEX "saved_item_student_id_target_type_target_id_key" ON "saved_item"("student_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "pieces_owner_id_updated_at_idx" ON "pieces"("owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "pieces_visibility_moderation_created_at_idx" ON "pieces"("visibility", "moderation", "created_at");

-- Seed default genre / level categories
INSERT INTO "category" ("id", "type", "name", "display_order", "updated_at")
SELECT gen_random_uuid()::text, seed."type"::"CategoryType", seed."name", seed."display_order", CURRENT_TIMESTAMP
FROM (VALUES
    ('GENRE', 'Dân ca Bắc Bộ', 1),
    ('GENRE', 'Dân ca Trung Bộ', 2),
    ('GENRE', 'Dân ca Nam Bộ', 3),
    ('GENRE', 'Nhạc tài tử', 4),
    ('GENRE', 'Nhạc cung đình', 5),
    ('GENRE', 'Nhạc mới', 6),
    ('LEVEL', 'Cơ bản', 1),
    ('LEVEL', 'Trung cấp', 2),
    ('LEVEL', 'Nâng cao', 3)
) AS seed("type", "name", "display_order")
ON CONFLICT ("type", "name") DO NOTHING;

-- Backfill pieces created before M02: owner = earliest teacher (else admin, else any user),
-- first genre / level by display order; teachers can change them later
UPDATE "pieces" SET
  "owner_id" = (
    SELECT "id" FROM "users"
    ORDER BY CASE "role" WHEN 2 THEN 0 WHEN 3 THEN 1 ELSE 2 END, "created_at"
    LIMIT 1
  ),
  "genre_id" = (SELECT "id" FROM "category" WHERE "type" = 'GENRE' ORDER BY "display_order", "name" LIMIT 1),
  "level_id" = (SELECT "id" FROM "category" WHERE "type" = 'LEVEL' ORDER BY "display_order", "name" LIMIT 1),
  "title_normalized" = btrim(regexp_replace(lower(translate("title", 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ', 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD')), '\s+', ' ', 'g')),
  "composer_normalized" = btrim(regexp_replace(lower(translate(coalesce("composer", ''), 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ', 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD')), '\s+', ' ', 'g')),
  "search_text" = btrim(regexp_replace(lower(translate("title" || ' ' || coalesce("composer", ''), 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ', 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD')), '\s+', ' ', 'g'))
WHERE "owner_id" IS NULL;

-- is_visible is replaced by visibility (+ moderation for admin hiding)
UPDATE "pieces" SET "visibility" = CASE WHEN "is_visible" THEN 'PUBLIC' ELSE 'HIDDEN' END::"Visibility";
ALTER TABLE "pieces" DROP COLUMN "is_visible";

ALTER TABLE "pieces" ALTER COLUMN "owner_id" SET NOT NULL,
ALTER COLUMN "genre_id" SET NOT NULL,
ALTER COLUMN "level_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_cover_file_id_fkey" FOREIGN KEY ("cover_file_id") REFERENCES "media_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_instrument" ADD CONSTRAINT "piece_instrument_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_instrument" ADD CONSTRAINT "piece_instrument_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_music" ADD CONSTRAINT "sheet_music_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_music" ADD CONSTRAINT "sheet_music_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_music" ADD CONSTRAINT "sheet_music_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_music" ADD CONSTRAINT "sheet_music_sheet_file_id_fkey" FOREIGN KEY ("sheet_file_id") REFERENCES "media_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_music" ADD CONSTRAINT "sheet_music_reference_audio_id_fkey" FOREIGN KEY ("reference_audio_id") REFERENCES "media_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_music" ADD CONSTRAINT "sheet_music_tutorial_video_id_fkey" FOREIGN KEY ("tutorial_video_id") REFERENCES "media_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_music" ADD CONSTRAINT "sheet_music_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_item" ADD CONSTRAINT "saved_item_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_item" ADD CONSTRAINT "saved_item_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_item" ADD CONSTRAINT "saved_item_sheet_music_id_fkey" FOREIGN KEY ("sheet_music_id") REFERENCES "sheet_music"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Upload limits used by the music library, editable from the admin system-config page
INSERT INTO "system_configs" ("id", "key", "value", "value_type", "group", "label", "updated_at")
SELECT gen_random_uuid()::text, seed."key", seed."value", 'NUMBER'::"ConfigValueType", 'FILE_LIMIT'::"ConfigGroup", seed."label", CURRENT_TIMESTAMP
FROM (VALUES
    ('upload.cover.max_mb', '5', 'Dung lượng ảnh bìa tối đa (MB)'),
    ('upload.sheet.max_mb', '10', 'Dung lượng file bản nhạc tối đa (MB)'),
    ('upload.audio.max_mb', '20', 'Dung lượng audio mẫu tối đa (MB)'),
    ('upload.audio.min_duration_sec', '1', 'Thời lượng audio mẫu tối thiểu (giây)'),
    ('upload.audio.max_duration_sec', '600', 'Thời lượng audio mẫu tối đa (giây)'),
    ('upload.video.max_mb', '200', 'Dung lượng video hướng dẫn tối đa (MB)')
) AS seed("key", "value", "label")
ON CONFLICT ("key") DO NOTHING;

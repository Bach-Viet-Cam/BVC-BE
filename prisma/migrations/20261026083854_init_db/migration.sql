-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "ConfigValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "ConfigGroup" AS ENUM ('FILE_LIMIT', 'SCORING', 'PRACTICE_RULE');

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('GENRE', 'LEVEL');

-- CreateEnum
CREATE TYPE "PieceKind" AS ENUM ('FINGER_EXERCISE', 'SONG');

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

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('PRACTICE', 'RHYTHM', 'RECORDING', 'SHEET', 'BONUS', 'EXAM');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubmissionStage" AS ENUM ('QUALITY_CHECK', 'AUDIO_ANALYSIS', 'COMPARISON', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "PracticeMode" AS ENUM ('SOLO', 'ENSEMBLE');

-- CreateEnum
CREATE TYPE "ClassMemberSource" AS ENUM ('IMPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImportLogStatus" AS ENUM ('PREVIEW', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('SOLO', 'ENSEMBLE', 'BONUS', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DEADLINE', 'ANNOUNCEMENT', 'SYSTEM', 'BONUS');

-- CreateEnum
CREATE TYPE "NotificationTarget" AS ENUM ('ALL', 'STUDENT', 'TEACHER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT');

-- CreateEnum
CREATE TYPE "LeaderboardCategory" AS ENUM ('OVERALL', 'ACCURACY', 'IMPROVEMENT', 'STREAK', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "role" INTEGER NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "student_code" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fmin_hz" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "fmax_hz" DOUBLE PRECISION NOT NULL DEFAULT 2000,
    "tolerance_cents" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "value_type" "ConfigValueType" NOT NULL,
    "group" "ConfigGroup" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "pieces" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "composer" VARCHAR(200),
    "description" VARCHAR(1000),
    "bpm" INTEGER NOT NULL DEFAULT 90,
    "cover_file_id" TEXT,
    "genre_id" TEXT NOT NULL,
    "category_id" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'HIDDEN',
    "moderation" "Moderation" NOT NULL DEFAULT 'NORMAL',
    "moderation_reason" TEXT,
    "title_normalized" TEXT NOT NULL DEFAULT '',
    "composer_normalized" TEXT NOT NULL DEFAULT '',
    "search_text" TEXT NOT NULL DEFAULT '',
    "kind" "PieceKind" NOT NULL DEFAULT 'SONG',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pieces_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "content_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cohort" VARCHAR(50) NOT NULL DEFAULT '',
    "description" VARCHAR(500),
    "instrument_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ClassStatus" NOT NULL DEFAULT 'ACTIVE',
    "ended_at" TIMESTAMP(3),
    "roadmap_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_members" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "source" "ClassMemberSource" NOT NULL DEFAULT 'MANUAL',
    "import_log_id" TEXT,
    "added_by" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "removed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_import_logs" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "lecturer_id" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_type" VARCHAR(10) NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "valid_rows" INTEGER NOT NULL,
    "error_rows" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,
    "status" "ImportLogStatus" NOT NULL DEFAULT 'PREVIEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "student_import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "sheet_music_id" TEXT,
    "title" TEXT NOT NULL,
    "type" "AssignmentType" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "week_no" INTEGER,
    "deadline" TIMESTAMP(3) NOT NULL,
    "target_bpm" INTEGER,
    "min_accuracy" INTEGER,
    "max_submissions" INTEGER NOT NULL DEFAULT 3,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "bonus_points" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "created_by" TEXT,
    "current_version_id" TEXT,
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_versions" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "kind" "AssignmentKind" NOT NULL,
    "sheet_music_id" TEXT,
    "required_bpm" INTEGER,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubrics" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,

    CONSTRAINT "rubrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubric_criteria" (
    "id" TEXT NOT NULL,
    "rubric_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rubric_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "piece_id" TEXT NOT NULL,
    "sheet_music_id" TEXT,
    "student_id" TEXT NOT NULL,
    "student_upload_id" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PROCESSING',
    "practice_mode" "PracticeMode" NOT NULL DEFAULT 'SOLO',
    "accuracy" DOUBLE PRECISION,
    "file_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignment_version_id" TEXT,
    "tempo_deviation" DOUBLE PRECISION,
    "analyzed_at" TIMESTAMP(3),
    "evaluation_id" TEXT,
    "message_id" TEXT,
    "publication_state" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "stage" "SubmissionStage",
    "stage_started_at" TIMESTAMP(3),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "retry_available_at" TIMESTAMP(3),
    "file_deleted_at" TIMESTAMP(3),
    "result" JSONB,
    "ai_feedback" TEXT,
    "pitch_chart" JSONB,
    "reject_reason" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_comments" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "lecturer_id" TEXT NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submission_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "target" "NotificationTarget" NOT NULL DEFAULT 'ALL',
    "status" "NotificationStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "link" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_uploads" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleting_at" TIMESTAMP(3),

    CONSTRAINT "audio_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_evaluation_requests" (
    "evaluation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "template_upload_id" TEXT NOT NULL,
    "student_upload_id" TEXT NOT NULL,
    "instrument_code" TEXT NOT NULL,
    "publication_state" TEXT NOT NULL DEFAULT 'publishing',
    "last_error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "audio_evaluation_requests_pkey" PRIMARY KEY ("evaluation_id")
);

-- CreateTable
CREATE TABLE "leaderboard_snapshots" (
    "id" TEXT NOT NULL,
    "semester" VARCHAR(50) NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "week_start" DATE NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,

    CONSTRAINT "leaderboard_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_entries" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "category" "LeaderboardCategory" NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "criteria" JSONB,

    CONSTRAINT "leaderboard_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instrument_id" TEXT,
    "piece_id" TEXT,
    "sheet_music_id" TEXT,
    "created_by" TEXT NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "min_accuracy" INTEGER,
    "required_bpm" INTEGER,
    "max_submissions" INTEGER NOT NULL DEFAULT 3,
    "paused_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_classes" (
    "challenge_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,

    CONSTRAINT "challenge_classes_pkey" PRIMARY KEY ("challenge_id","class_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_student_code_key" ON "users"("student_code");

-- CreateIndex
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_provider_id_key" ON "auth_identities"("provider", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_hash_key" ON "auth_sessions"("refresh_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_code_key" ON "instruments"("code");

-- CreateIndex
CREATE INDEX "instrument_tunes_instrument_id_idx" ON "instrument_tunes"("instrument_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_type_name_key" ON "category"("type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "media_file_storage_key_key" ON "media_file"("storage_key");

-- CreateIndex
CREATE INDEX "media_file_uploaded_by_idx" ON "media_file"("uploaded_by");

-- CreateIndex
CREATE INDEX "pieces_owner_id_updated_at_idx" ON "pieces"("owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "pieces_visibility_moderation_created_at_idx" ON "pieces"("visibility", "moderation", "created_at");

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
CREATE INDEX "content_categories_parent_id_idx" ON "content_categories"("parent_id");

-- CreateIndex
CREATE INDEX "class_members_user_id_idx" ON "class_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "roadmaps_instrument_id_version_key" ON "roadmaps"("instrument_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_weeks_roadmap_id_week_number_key" ON "roadmap_weeks"("roadmap_id", "week_number");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_week_exercises_roadmap_week_id_sort_order_key" ON "roadmap_week_exercises"("roadmap_week_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_week_exercises_roadmap_week_id_piece_id_key" ON "roadmap_week_exercises"("roadmap_week_id", "piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_current_version_id_key" ON "assignments"("current_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_versions_assignment_id_version_key" ON "assignment_versions"("assignment_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "rubrics_assignment_id_key" ON "rubrics"("assignment_id");

-- CreateIndex
CREATE INDEX "rubric_criteria_rubric_id_idx" ON "rubric_criteria"("rubric_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_evaluation_id_key" ON "submissions"("evaluation_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_message_id_key" ON "submissions"("message_id");

-- CreateIndex
CREATE INDEX "submissions_assignment_id_student_id_idx" ON "submissions"("assignment_id", "student_id");

-- CreateIndex
CREATE INDEX "submissions_assignment_id_status_idx" ON "submissions"("assignment_id", "status");

-- CreateIndex
CREATE INDEX "submissions_student_id_piece_id_status_idx" ON "submissions"("student_id", "piece_id", "status");

-- CreateIndex
CREATE INDEX "submissions_student_id_created_at_idx" ON "submissions"("student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "submission_comments_submission_id_key" ON "submission_comments"("submission_id");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_at_idx" ON "notifications"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "user_notifications_user_id_is_read_idx" ON "user_notifications"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "user_notifications_notification_id_user_id_key" ON "user_notifications"("notification_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "audio_uploads_url_key" ON "audio_uploads"("url");

-- CreateIndex
CREATE INDEX "audio_uploads_owner_id_idx" ON "audio_uploads"("owner_id");

-- CreateIndex
CREATE INDEX "audio_uploads_created_at_idx" ON "audio_uploads"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audio_uploads_provider_key_key" ON "audio_uploads"("provider", "key");

-- CreateIndex
CREATE UNIQUE INDEX "audio_evaluation_requests_message_id_key" ON "audio_evaluation_requests"("message_id");

-- CreateIndex
CREATE INDEX "audio_evaluation_requests_owner_id_created_at_idx" ON "audio_evaluation_requests"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "audio_evaluation_requests_template_upload_id_idx" ON "audio_evaluation_requests"("template_upload_id");

-- CreateIndex
CREATE INDEX "audio_evaluation_requests_student_upload_id_idx" ON "audio_evaluation_requests"("student_upload_id");

-- CreateIndex
CREATE INDEX "leaderboard_snapshots_semester_generated_at_idx" ON "leaderboard_snapshots"("semester", "generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_snapshots_semester_snapshot_date_key" ON "leaderboard_snapshots"("semester", "snapshot_date");

-- CreateIndex
CREATE INDEX "leaderboard_entries_snapshot_id_category_position_idx" ON "leaderboard_entries"("snapshot_id", "category", "position");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_entries_snapshot_id_category_student_id_key" ON "leaderboard_entries"("snapshot_id", "category", "student_id");

-- CreateIndex
CREATE INDEX "challenges_created_by_starts_at_idx" ON "challenges"("created_by", "starts_at");

-- CreateIndex
CREATE INDEX "challenges_status_starts_at_ends_at_idx" ON "challenges"("status", "starts_at", "ends_at");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrument_tunes" ADD CONSTRAINT "instrument_tunes_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_cover_file_id_fkey" FOREIGN KEY ("cover_file_id") REFERENCES "media_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "content_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "content_categories" ADD CONSTRAINT "content_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "content_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_import_log_id_fkey" FOREIGN KEY ("import_log_id") REFERENCES "student_import_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_import_logs" ADD CONSTRAINT "student_import_logs_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_import_logs" ADD CONSTRAINT "student_import_logs_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_sheet_music_id_fkey" FOREIGN KEY ("sheet_music_id") REFERENCES "sheet_music"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "assignment_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_sheet_music_id_fkey" FOREIGN KEY ("sheet_music_id") REFERENCES "sheet_music"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "rubrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_version_id_fkey" FOREIGN KEY ("assignment_version_id") REFERENCES "assignment_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_sheet_music_id_fkey" FOREIGN KEY ("sheet_music_id") REFERENCES "sheet_music"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_upload_id_fkey" FOREIGN KEY ("student_upload_id") REFERENCES "audio_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_comments" ADD CONSTRAINT "submission_comments_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_uploads" ADD CONSTRAINT "audio_uploads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_evaluation_requests" ADD CONSTRAINT "audio_evaluation_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_evaluation_requests" ADD CONSTRAINT "audio_evaluation_requests_template_upload_id_fkey" FOREIGN KEY ("template_upload_id") REFERENCES "audio_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_evaluation_requests" ADD CONSTRAINT "audio_evaluation_requests_student_upload_id_fkey" FOREIGN KEY ("student_upload_id") REFERENCES "audio_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "leaderboard_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_sheet_music_id_fkey" FOREIGN KEY ("sheet_music_id") REFERENCES "sheet_music"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_classes" ADD CONSTRAINT "challenge_classes_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_classes" ADD CONSTRAINT "challenge_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

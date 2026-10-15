-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('ACTIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "ClassMemberSource" AS ENUM ('IMPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImportLogStatus" AS ENUM ('PREVIEW', 'CONFIRMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "student_code" VARCHAR(50);

-- CreateTable
CREATE TABLE "instruments" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "cohort" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500),
    "instrument_id" TEXT NOT NULL,
    "lecturer_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "ClassStatus" NOT NULL DEFAULT 'ACTIVE',
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_members" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "source" "ClassMemberSource" NOT NULL,
    "import_log_id" TEXT,
    "added_by" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "removed_by" TEXT,

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

-- CreateIndex
CREATE UNIQUE INDEX "instruments_name_key" ON "instruments"("name");

-- CreateIndex
CREATE INDEX "classes_lecturer_id_status_idx" ON "classes"("lecturer_id", "status");

-- CreateIndex
CREATE INDEX "classes_instrument_id_idx" ON "classes"("instrument_id");

-- CreateIndex
CREATE INDEX "class_members_class_id_idx" ON "class_members"("class_id");

-- CreateIndex
CREATE INDEX "class_members_student_id_idx" ON "class_members"("student_id");

-- CreateIndex
CREATE INDEX "class_members_import_log_id_idx" ON "class_members"("import_log_id");

-- CreateIndex
CREATE INDEX "class_members_added_by_idx" ON "class_members"("added_by");

-- CreateIndex
CREATE INDEX "class_members_removed_by_idx" ON "class_members"("removed_by");

-- CreateIndex
CREATE INDEX "student_import_logs_class_id_idx" ON "student_import_logs"("class_id");

-- CreateIndex
CREATE INDEX "student_import_logs_lecturer_id_idx" ON "student_import_logs"("lecturer_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_student_code_key" ON "users"("student_code");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_import_log_id_fkey" FOREIGN KEY ("import_log_id") REFERENCES "student_import_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_import_logs" ADD CONSTRAINT "student_import_logs_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_import_logs" ADD CONSTRAINT "student_import_logs_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Manual: constraints Prisma cannot express in schema.prisma
-- DBR-02: class name unique within a cohort, case-insensitive
CREATE UNIQUE INDEX "classes_cohort_lower_name_key" ON "classes"("cohort", lower("name"));

-- One active membership per (class, student); soft-removed rows are kept (GBR-39)
CREATE UNIQUE INDEX "class_members_active_key" ON "class_members"("class_id", "student_id") WHERE "removed_at" IS NULL;

-- Emails are compared case-insensitively (import + Google sign-in)
CREATE UNIQUE INDEX "users_lower_email_key" ON "users"(lower("email"));

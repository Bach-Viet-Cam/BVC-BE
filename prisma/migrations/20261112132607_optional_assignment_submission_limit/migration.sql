ALTER TABLE "assignments" ALTER COLUMN "max_submissions" DROP NOT NULL,
ALTER COLUMN "max_submissions" DROP DEFAULT;

UPDATE "assignments" SET "max_submissions" = NULL WHERE "max_submissions" = 3;

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

-- AddForeignKey
ALTER TABLE "audio_uploads" ADD CONSTRAINT "audio_uploads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_evaluation_requests" ADD CONSTRAINT "audio_evaluation_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_evaluation_requests" ADD CONSTRAINT "audio_evaluation_requests_template_upload_id_fkey" FOREIGN KEY ("template_upload_id") REFERENCES "audio_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_evaluation_requests" ADD CONSTRAINT "audio_evaluation_requests_student_upload_id_fkey" FOREIGN KEY ("student_upload_id") REFERENCES "audio_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

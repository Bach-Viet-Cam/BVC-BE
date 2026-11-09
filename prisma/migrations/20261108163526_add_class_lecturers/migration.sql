-- CreateTable
CREATE TABLE "class_lecturers" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "lecturer_id" TEXT NOT NULL,
    "added_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
Sa
    CONSTRAINT "class_lecturers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_lecturers_lecturer_id_idx" ON "class_lecturers"("lecturer_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_lecturers_class_id_lecturer_id_key" ON "class_lecturers"("class_id", "lecturer_id");

-- AddForeignKey
ALTER TABLE "class_lecturers" ADD CONSTRAINT "class_lecturers_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_lecturers" ADD CONSTRAINT "class_lecturers_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_lecturers" ADD CONSTRAINT "class_lecturers_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

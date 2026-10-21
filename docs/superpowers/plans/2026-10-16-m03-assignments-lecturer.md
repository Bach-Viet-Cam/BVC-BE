# M03 · Dự án con 3a — Bài tập phía giảng viên · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảng viên đăng bài luyện tập cho cả lớp (nháp / đăng / sửa có phiên bản / đóng / mở lại / xóa mềm), xem trạng thái từng sinh viên, nghe lại và nhận xét từng bài nộp. Admin cấu hình ngưỡng chấm điểm.

**Architecture:**
- Module BE mới `src/modules/assignments` (static-class layers) đọc và ghi các bảng tối thiểu `submissions` (`TODO(M01)`).
- Phần dùng chung của M06 đặt trong module `platform`: `system_settings`, `notifications`, `GradingSettingsService`, `NotificationService` (`TODO(M06)`).
- Trạng thái sinh viên tính lúc đọc bằng hàm thuần `AssignmentProgressCalculator`.
- FE: các màn mobile-first trong `features/classes`; trang Admin dùng `AdminShell`.

**Tech Stack:** Express 5 · Prisma 7 · PostgreSQL 16 · Zod 4 · Vitest + supertest · React 19 · react-hook-form + zod 3 · Tailwind v4 (token `bvc-*`).

**Spec:** `BVC-BE/docs/superpowers/specs/2026-10-16-m03-assignments-lecturer-design.md`

## Global Constraints

- **Nhánh:** cả hai repo trên `feature/m03-classes-members`. **Không commit**: chỉ chuẩn bị lệnh, người dùng tự commit. Không sửa `.github/workflows/*`, không migrate DB chung. Chỉ dùng DB local cổng **5433**.
- **Loại bài:** `SOLO` "Độc tấu", `ENSEMBLE` "Hòa tấu", `BONUS` "Bonus", `OTHER` "Bài tập khác". **Trạng thái bài:** `DRAFT` "Nháp", `PUBLISHED` "Đã đăng", `CLOSED` "Đã đóng".
- **Trạng thái sinh viên:** `NOT_SUBMITTED` "Chưa nộp", `SUBMITTED` "Đã nộp", `PASSED` "Đạt".
- **Trạng thái bài nộp:** `PROCESSING` "Đang xử lý", `COMPLETED` "Hoàn tất", `REJECTED` "Từ chối", `FAILED` "Lỗi xử lý". Bài nộp **được đếm** khi status ∉ {REJECTED, FAILED}.
- **Giới hạn:** tiêu đề trim 1–200; mô tả ≤ 1000; `requiredBpm` nguyên 1–300 (không bắt buộc); nhận xét trim 1–2000; cấu hình `minAccuracy`, `atRiskMargin` nguyên 0–100 và `atRiskMargin ≤ minAccuracy`; ô tìm ≤ 100.
- **Câu chữ:**
  - MSG-01: "Tạo bài tập thành công." / "Cập nhật bài tập thành công." / "Đăng bài tập thành công." / "Đóng bài tập thành công." / "Mở lại bài tập thành công." / "Xóa bài tập thành công." / "Gửi nhận xét thành công." / "Cập nhật nhận xét thành công." / "Lưu cấu hình chấm điểm thành công.";
  - MSG-48: "Bài nhạc đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác.";
  - MSG-03: "BPM yêu cầu phải nằm trong khoảng từ 1 đến 300.";
  - "Biên có nguy cơ không được lớn hơn độ chính xác tối thiểu.";
  - "Không thể nhận xét vì lớp đã kết thúc hoặc sinh viên không còn trong lớp.";
  - "Không thể nộp bài vì bài tập đã đóng hoặc không còn khả dụng.".
- **Thông báo:** title "Bài tập mới" / "Bài tập đã được cập nhật" / "Giảng viên đã nhận xét bài nộp"; body `<tên lớp> · <tiêu đề>`; link `/student/assignments/<assignmentId>`.
- **Quyền:** chỉ giảng viên sở hữu lớp (lớp/bài của người khác → 404; vai trò khác → 403). Lớp `FINISHED` → mọi thao tác ghi 409 MSG-08. Bài đã xóa → 404 ở mọi API.
- **Ngưỡng** chỉ đọc từ `system_settings`; thiếu khóa → lỗi 500, **không** giá trị dự phòng hardcode.
- **FE:** giảng viên mobile-first (360 px, vùng chạm ≥ 44 px), Admin desktop; ngày giờ `dd/MM/yyyy HH:mm`.

## Review Focus

1. **Sửa bài sau khi đã có bài nộp:** bài nộp cũ vẫn hiện "phiên bản v1" và vẫn được đếm. *Test: Task 5 `old submissions keep their version after an edit`.*
2. **Bài nhạc bị ẩn sau khi gắn vào bài tập:** chi tiết hiện `isAvailable:false`; sửa mà giữ bài nhạc đó → MSG-48 tại `pieceId`. *Test: Task 4 `editing with a hidden piece returns MSG-48`.*
3. **Sinh viên bị xóa khỏi lớp:** không có trong `students[]` và không tính vào `submittedCount`, nhưng bài nộp vẫn xem được ở màn bài nộp với `canComment:false`. *Test: Task 5.*
4. **Lớp kết thúc:** bài đang đăng thành đã đóng; tạo/sửa/đăng/mở lại/nhận xét đều 409. *Test: Task 4 `ending the class closes published assignments and blocks writes`, Task 5 comment 409.*
5. **Admin đổi ngưỡng:** trạng thái "Đạt" của sinh viên đổi ngay ở lần đọc sau. *Test: Task 5 `status follows the current grading settings`.*

---

### Task 0: Chuẩn bị
- [ ] `git -C BVC-BE branch --show-current` và `git -C BVC-FE branch --show-current` đều ra `feature/m03-classes-members`. Working tree có thể còn thay đổi chưa commit của dự án con 2 (baseVersion); giữ nguyên.
- [ ] `podman start bvc-dev-postgres && podman exec bvc-dev-postgres pg_isready -U bvc`.
- [ ] Tạo ledger `BVC-BE/.superpowers/sdd/2026-10-16-m03-assignments-lecturer/progress.md`.

---

### Task 1: Schema + migration `m03_assignments`

**Files:**
- Modify: `BVC-BE/prisma/schema.prisma`
- Create: `BVC-BE/prisma/migrations/20261017000000_m03_assignments/{migration.sql,down.sql}`
- Modify: `BVC-BE/tests/integration/TestDatabase.ts`

**Interfaces:**
- Produces:
  - Prisma models `SystemSetting` (`system_settings`, PK `key`), `Notification`, `Assignment`, `AssignmentVersion`, `Submission`, `SubmissionComment`;
  - enums `AssignmentStatus`, `AssignmentKind`, `SubmissionStatus`. Cột theo spec §3.
- `TestDatabase.reset()` truncate thêm `submission_comments, submissions, notifications, assignment_versions, assignments`. **Không** truncate `system_settings`, nhưng sau truncate phải chạy lại: `INSERT … ('grading.minAccuracy','70'),('grading.atRiskMargin','40') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`.
- Factory:
  - `TestDatabase.createAssignment(classId, lecturerId, overrides?: Partial<{ title; kind; status; pieceId; requiredBpm; deletedAt: Date }>)`: tạo assignment + version 1 và đặt `currentVersionId`;
  - `TestDatabase.createSubmission(assignmentId, studentId, overrides?: Partial<{ status; accuracy: number | null; submittedAt: Date; versionId: string }>)`: lấy `classId` và `currentVersionId` từ assignment, `audioUrl = '/samples/bvc-sample.wav'`.

- [ ] **Step 1:** Thêm models (`// TODO(M06)` trên `SystemSetting`, `Notification`; `// TODO(M01)` trên `Submission`). `AssignmentVersion @@unique([assignmentId, version])`, `SubmissionComment.submissionId @unique`, index theo spec §3.
- [ ] **Step 2:** Sinh `migration.sql` bằng `prisma migrate diff --from-config-datasource --to-schema` trên `bvc_dev`. Kiểm tra **không có DROP**. Thêm tay:
  `INSERT INTO "system_settings" ("key","value","updated_at") VALUES ('grading.minAccuracy','70',NOW()),('grading.atRiskMargin','40',NOW());`
- [ ] **Step 3:** Viết `down.sql` (drop theo thứ tự phụ thuộc + 3 enum + hướng dẫn xóa dòng `_prisma_migrations`).
- [ ] **Step 4:** Chạy deploy → down → deploy trên `bvc_dev`; `migrate diff` ra "empty". Deploy lên `bvc_test`. Chạy `npx prisma generate`.
- [ ] **Step 5:** Cập nhật `TestDatabase`. Chạy `npm test && npm run build` → 84/84, tsc sạch.

---

### Task 2: Cấu hình chấm điểm (platform)

**Files:**
- Create: `BVC-BE/src/modules/platform/service/GradingSettingsService.ts`, `BVC-BE/src/modules/platform/repository/SettingsRepository.ts`, `BVC-BE/src/types/PlatformTypes.d.ts`
- Modify: `PlatformConstant.ts`, `PlatformValidation.ts`, `PlatformController.ts`, `PlatformRoute.ts`
- Test: `BVC-BE/tests/integration/gradingSettings.test.ts`

**Interfaces:**
- Produces:
  - `interface Backend.GradingSettings { minAccuracy: number; atRiskMargin: number; updatedAt: string | null }`
  - `GradingSettingsService.getGradingSettings(client?: Prisma.TransactionClient): Promise<Backend.GradingSettings>`: thiếu khóa → `new AppError('Thiếu cấu hình chấm điểm.', 500)`
  - `GradingSettingsService.updateGradingSettings(adminId: string, input: { minAccuracy: number; atRiskMargin: number }): Promise<Backend.GradingSettings>`
  - `PlatformConstant.settingKeys = { MIN_ACCURACY: 'grading.minAccuracy', AT_RISK_MARGIN: 'grading.atRiskMargin' }`
  - Route `GET` + `PUT /admin/settings/grading` (`SYSTEM_ADMIN`)
- [ ] **Step 1: Test:**
  - `returns seeded 70/40`
  - `updates both values` (message MSG-01 cấu hình)
  - `rejects margin greater than minimum` (400, field `atRiskMargin`, câu trong Global Constraints)
  - `rejects values outside 0–100 and non-integers` (400, MSG-03 field `minAccuracy`)
  - `lecturer gets 403`
  - `missing key makes getGradingSettings throw 500`: xóa 1 dòng rồi gọi service trực tiếp
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Cài đặt. Zod: `z.number().int().min(0).max(100)` với message MSG-03 theo nhãn "Độ chính xác tối thiểu" / "Biên có nguy cơ". Kiểm tra biên ≤ ngưỡng trong service bằng `AppError.fieldError(400, …)`. Upsert 2 dòng trong 1 transaction, ghi `updated_by`.
- [ ] **Step 4:** Chạy → PASS. `npm test` → PASS.

---

### Task 3: Logic thuần + hằng số của module assignments

**Files:**
- Create: `BVC-BE/src/modules/assignments/constant/AssignmentConstant.ts`, `BVC-BE/src/modules/assignments/service/AssignmentProgressCalculator.ts`, `BVC-BE/src/types/AssignmentTypes.d.ts`
- Test: `BVC-BE/tests/unit/AssignmentProgressCalculator.test.ts`

**Interfaces:**
- Produces:
  - types:
    - `AssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED'`
    - `AssignmentKind = 'SOLO' | 'ENSEMBLE' | 'BONUS' | 'OTHER'`
    - `SubmissionStatus = 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED'`
    - `StudentAssignmentStatus = 'NOT_SUBMITTED' | 'SUBMITTED' | 'PASSED'`
  - `AssignmentConstant.limits = { TITLE_MAX: 200, DESCRIPTION_MAX: 1000, BPM_MIN: 1, BPM_MAX: 300, COMMENT_MAX: 2000, SEARCH_MAX: 100 }`, `messages` (mọi câu trong Global Constraints), `notifications`, `auditActions` (`ASSIGNMENT_CREATE|UPDATE|PUBLISH|CLOSE|REOPEN|DELETE`)
  - `AssignmentProgressCalculator.isCounted(status: SubmissionStatus): boolean`
  - `AssignmentProgressCalculator.summarize(submissions: Array<{ status: SubmissionStatus; accuracy: number | null; submittedAt: Date }>, minAccuracy: number): { status: StudentAssignmentStatus; submissionCount: number; lastSubmittedAt: Date | null; bestAccuracy: number | null }`. `submissionCount`, `lastSubmittedAt`, `bestAccuracy` chỉ tính trên bài nộp **được đếm**; `bestAccuracy` chỉ lấy bài COMPLETED.
- [ ] **Step 1: Test:**
  - không có bài nộp → `NOT_SUBMITTED`, 0, null, null;
  - chỉ REJECTED + FAILED → `NOT_SUBMITTED`;
  - PROCESSING → `SUBMITTED`, `bestAccuracy` null;
  - COMPLETED 69.99 với ngưỡng 70 → `SUBMITTED`;
  - COMPLETED đúng 70 → `PASSED`;
  - nhiều bài → đếm đúng, `lastSubmittedAt` lớn nhất, `bestAccuracy` lớn nhất.
- [ ] **Step 2:** FAIL → **Step 3:** cài đặt → **Step 4:** PASS.

---

### Task 4: Vòng đời bài tập (ghi)

**Files:**
- Create: `BVC-BE/src/modules/assignments/{model/AssignmentModel.ts, repository/AssignmentRepository.ts, service/AssignmentAccessService.ts, service/AssignmentService.ts, validation/AssignmentValidation.ts, controller/AssignmentController.ts, route/AssignmentRoute.ts, dto/AssignmentDTO.ts}`
- Create: `BVC-BE/src/modules/platform/{service/NotificationService.ts, repository/NotificationRepository.ts}`
- Modify: `BVC-BE/src/routes/index.ts`; `BVC-BE/src/modules/classes/service/ClassService.ts` (`endClass`)
- Test: `BVC-BE/tests/integration/assignmentLifecycle.test.ts`

**Interfaces:**
- Consumes: Task 2 (không cần), Task 3; `ClassAccessService.assertOwnedClass`; `AuditLogger.record`; `RoadmapRepository` **không** dùng.
- Produces:
  - `NotificationService.notifyUsers(userIds: string[], notification: { title: string; body: string; link: string }, client: Prisma.TransactionClient): Promise<number>`
  - `AssignmentAccessService.assertOwnedAssignment(assignmentId: string, lecturerId: string, options?: { requireActiveClass?: boolean }): Promise<Backend.AssignmentRecord>` (record gồm `class { id, name, status, instrumentId, lecturerId }` và `currentVersion`)
  - `AssignmentService.createAssignment(lecturerId, input: Backend.CreateAssignmentInput): Promise<Backend.AssignmentDetailDTO>`, với `CreateAssignmentInput = { classId; title; description?: string | null; kind; pieceId?: string | null; requiredBpm?: number | null; publish: boolean }`
  - `AssignmentService.updateAssignment(id, lecturerId, input: Omit<CreateAssignmentInput, 'classId' | 'publish'>)`
  - `publishAssignment`, `closeAssignment`, `reopenAssignment`, `deleteAssignment` (cùng chữ ký `(id, lecturerId)`)
  - `AssignmentService.closePublishedForClass(classId: string, client: Prisma.TransactionClient): Promise<number>` (`ClassService.endClass` gọi trong transaction)
  - Route gắn `/assignments`, chỉ `TEACHER`:
    - `POST /`
    - `PUT /:id`
    - `POST /:id/publish|close|reopen`
    - `DELETE /:id`
  - Các thao tác ghi trả `AssignmentDetailDTO` (Task 5 định nghĩa đầy đủ). Ở task này DTO tối thiểu gồm `{ id, classId, status, version, title, description, kind, piece, requiredBpm }`; Task 5 mở rộng thêm.
- [ ] **Step 1: Test:**
  - `creates a draft without notifications` (status DRAFT, version 1, `notifications` count 0)
  - `creates and publishes, notifying active members only` (2 thành viên đang trong lớp + 1 đã bị xóa → 2 thông báo; title "Bài tập mới", link `/student/assignments/<id>`)
  - `validates title, description, kind and bpm` (field errors: title MSG-35, description MSG-37 tại 1001 ký tự, requiredBpm 0 và 301 → MSG-03)
  - `rejects a piece of another instrument or hidden piece with MSG-48`
  - `editing creates version 2 and notifies only when published`
  - `editing with a hidden piece returns MSG-48`
  - `closed assignment can still be edited`
  - `publish only from draft; close only from published; reopen only from closed (409 otherwise)`
  - `soft delete hides the assignment (404 afterwards)`
  - `ending the class closes published assignments and blocks writes` (sau endClass: bài PUBLISHED → CLOSED; POST tạo mới, PUT, reopen → 409 MSG-08)
  - `another lecturer gets 404, student gets 403`
  - `writes audit rows`
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Cài đặt.
  - Mọi thao tác ghi chạy trong `$transaction`, gồm: assignment (+ version), cập nhật `currentVersionId`, thông báo, audit.
  - Version mới = `max(version) + 1`.
  - Bài nhạc hợp lệ khi `pieces.isVisible && pieces.instrumentId === class.instrumentId`.
  - Nhắc lại: không có hạn nộp, không có rubric.
- [ ] **Step 4:** PASS. Chạy `npm test` → PASS (kể cả `classes.test.ts`, vì `endClass` đã đổi).

---

### Task 5: Đọc + bài nộp + nhận xét + canSubmit

**Files:**
- Create: `BVC-BE/src/modules/assignments/{repository/SubmissionRepository.ts, service/AssignmentQueryService.ts, service/SubmissionCommentService.ts, service/SubmissionPolicyService.ts}`
- Modify: AssignmentDTO, AssignmentValidation, AssignmentController, AssignmentRoute
- Test: `BVC-BE/tests/integration/assignmentQueries.test.ts`, `BVC-BE/tests/integration/submissionComments.test.ts`

**Interfaces:**
- Consumes: Task 2 `GradingSettingsService.getGradingSettings`, Task 3, Task 4.
- Produces:
  - `AssignmentListItemDTO = { id; classId; className; status; version; title; kind; submittedCount; memberCount; updatedAt }`
  - `AssignmentDetailDTO = { id; classId; className; classStatus; status; version; title; description; kind; piece: { id; title; defaultBpm; isAvailable } | null; requiredBpm; effectiveBpm; publishedAt; closedAt; updatedAt; students: AssignmentStudentDTO[] }`
  - `AssignmentStudentDTO = { studentId; fullName; studentCode; status: StudentAssignmentStatus; submissionCount; lastSubmittedAt: string | null; bestAccuracy: number | null }`
  - `StudentSubmissionsDTO = { student: { id; fullName; studentCode }; canComment: boolean; submissions: Array<{ id; attemptNumber; version; status; accuracy; tempoDeviation; audioUrl; submittedAt; comment: { content; updatedAt } | null }> }`. `attemptNumber` = thứ tự theo `submittedAt` tăng dần, tính trên **mọi** bài nộp; trả về mới nhất trước.
  - Routes:
    - `GET /assignments?classId&kind&status&q&page&limit` → `{ items, pagination }`
    - `GET /assignments/:id`
    - `GET /assignments/:id/students/:studentId/submissions`
    - `PUT /submissions/:id/comment` `{ content }` → `{ data: comment, message }`
  - `SubmissionPolicyService.canSubmit(studentId: string, assignmentId: string): Promise<{ allowed: boolean; reason: string | null }>`
  - `GET /assignments/pieces?classId=` (giảng viên sở hữu lớp) → `[{ id, title, kind, defaultBpm }]`: bài đang hiển thị cùng nhạc cụ, xếp theo tiêu đề. Spec chưa nêu endpoint này; form A15 cần nó vì API pieces hiện chỉ có cho Admin. Đăng ký route này **trước** `/:id`.
- [ ] **Step 1: Test** (`assignmentQueries.test.ts`):
  - `lists own non-deleted assignments with filters and submittedCount` (bài của giảng viên khác không xuất hiện)
  - `detail lists active members with status, counts, best accuracy and effective bpm` (`requiredBpm` null → `effectiveBpm` = `defaultBpm` của bài nhạc)
  - `removed student is excluded from students and submittedCount`
  - `old submissions keep their version after an edit` (submissions endpoint: lần 1 version 1, lần 2 version 2)
  - `status follows the current grading settings` (accuracy 65: SUBMITTED; PUT settings min 60 → PASSED)
  - `lists visible pieces of the class instrument` (bài ẩn và bài của nhạc cụ khác không có; lớp của người khác → 404)
  - `canSubmit: published + active class + active member only` (draft, closed, deleted, finished class, removed member → `allowed:false` với reason đúng câu)
- [ ] **Step 2: Test** (`submissionComments.test.ts`):
  - `first comment notifies the student, update does not`
  - `content 1–2000 after trim`
  - `comment is locked for a removed student or finished class (409)`
  - `another lecturer gets 404`
  - `removed student's submissions stay viewable with canComment false`
- [ ] **Step 3:** FAIL.
- [ ] **Step 4:** Cài đặt. `getDetail` đọc settings một lần, gom bài nộp theo sinh viên, rồi gọi `AssignmentProgressCalculator.summarize` cho từng sinh viên.
- [ ] **Step 5:** PASS. Thêm `src/modules/assignments/**` và `src/modules/platform/**` vào `coverage.include`. Chạy `npm run test:coverage` → ngưỡng 70 % đạt.

---

### Task 6: Bỏ `assignments` khỏi lộ trình, seed, tài liệu

**Files:**
- Modify: `BVC-BE/src/types/RoadmapTypes.d.ts`, `RoadmapService.ts:75`, `docs/api/m03-roadmaps.md` (bỏ `assignments`), `tests/integration/classRoadmap.test.ts` (bỏ `assignments: []` trong `toMatchObject`)
- Modify: `BVC-BE/prisma/seed.ts`
- Create: `BVC-BE/docs/api/m03-assignments.md`
- [ ] **Step 1:** Sửa test lộ trình để khẳng định tuần **không** có khóa `assignments` (`expect(roadmap.weeks[0]).not.toHaveProperty('assignments')`). Chạy → FAIL. Bỏ trường → PASS.
- [ ] **Step 2:** Seed (idempotent theo tiêu đề bài + lớp) đúng như spec §7. Bài nộp trải từ 20 % đến 95 %, có REJECTED và FAILED, 3 nhận xét. Chạy seed 2 lần, kiểm tra số dòng không đổi.
- [ ] **Step 3:** Viết `m03-assignments.md` (endpoint, body, lỗi, quyền, `canSubmit`), theo khuôn `m03-classes.md`.
- [ ] **Step 4:** `npm run lint && npm run build && npm test` → sạch, PASS.

---

### Task 7: FE — nền tảng (types, api, hooks, nav, route, danh sách + tab lớp)

**Files:**
- Create: `BVC-FE/src/features/classes/{types/assignmentTypes.ts, api/assignmentsApi.ts, utils/assignmentFormat.ts}`
- Create hooks: `useAssignmentList`, `useAssignmentDetail`, `useStudentSubmissions`, `useAssignmentActions`, `useSaveAssignment`, `useSaveComment`, `useClassPieces` (gọi `GET /assignments/pieces?classId=` của Task 5)
- Create: `components/AssignmentCard.tsx`, `components/AssignmentList.tsx` (dùng chung cho trang và tab), `pages/AssignmentListPage.tsx`
- Modify: `MobileAppShell.tsx` (mục "Bài tập" → `/teacher/assignments`), `ClassDetailPage.tsx` (tab `assignments` → `<AssignmentList classId=… canCreate=…>`), `src/app/router.tsx`
- Test: `__tests__/assignmentFormat.test.ts`, `__tests__/AssignmentList.test.tsx`

**Interfaces:**
- Produces:
  - `ASSIGNMENT_KIND_LABELS`, `ASSIGNMENT_STATUS_LABELS`, `STUDENT_STATUS_LABELS`, `SUBMISSION_STATUS_LABELS` (Global Constraints);
  - `assignmentsApi` với 1 hàm cho mỗi endpoint của Task 4–5 + pieces;
  - route giảng viên (trong `ProtectedRoute allowedRoles=[TEACHER]`):
    - `/teacher/assignments`
    - `/teacher/assignments/new`
    - `/teacher/assignments/:assignmentId`
    - `/teacher/assignments/:assignmentId/edit`
    - `/teacher/assignments/:assignmentId/students/:studentId`
- [ ] **Step 1: Test:**
  - nhãn tiếng Việt đúng;
  - `AssignmentList`: render thẻ gồm tiêu đề, nhãn loại, tên lớp, "3/20 đã nộp";
  - rỗng → "Bạn chưa có bài tập nào.";
  - lọc không ra → "Không tìm thấy bài tập phù hợp.";
  - ẩn nút "Tạo bài tập" khi `canCreate=false`.
- [ ] **Step 2:** FAIL → **Step 3:** cài đặt (chip lọc dùng `FilterSelect`, tìm kiếm dùng `SearchInput` + debounce) → **Step 4:** PASS, `npx tsc -b` sạch.

---

### Task 8: FE — Form tạo/sửa bài tập

**Files:**
- Create: `utils/validateAssignment.ts`, `components/AssignmentForm.tsx`, `pages/AssignmentFormPage.tsx` (**thay** file mockup cùng tên hiện có)
- Test: `__tests__/AssignmentForm.test.tsx`

**Interfaces:**
- Produces:
  - `assignmentFormSchema`: `classId` bắt buộc; `title` trim 1–200; `kind`; `description` ≤ 1000; `pieceId` (chuỗi rỗng = không chọn); `requiredBpm` (chuỗi; rỗng hoặc nguyên 1–300);
  - `toAssignmentPayload(values, publish?: boolean)`;
  - `AssignmentForm({ mode: 'create' | 'edit', initialValues, classes, onSubmit(payload, publish) })`.
- [ ] **Step 1: Test:**
  - lỗi bắt buộc nhập (Lớp, Tiêu đề, Loại);
  - BPM "0" / "301" / "1.5" → MSG-03; mô tả 1001 ký tự → MSG-37;
  - "Lưu nháp" gửi `publish:false`, "Lưu & Giao Bài" gửi `publish:true`;
  - chế độ sửa: Lớp chỉ đọc, chỉ có nút "Lưu";
  - lỗi server `pieceId` MSG-48 hiện dưới ô Bài nhạc;
  - chọn bài nhạc → ô BPM hiện gợi ý "Mặc định: 96".
- [ ] **Step 2:** FAIL → **Step 3:** cài đặt (mẫu `ClassForm`, `FooterActions`, `applyFieldErrors`; trang đọc `?classId=` để chọn sẵn) → **Step 4:** PASS.

---

### Task 9: FE — Chi tiết bài + bài nộp của sinh viên + nhận xét

**Files:**
- Create: `components/AssignmentInfoPanel.tsx`, `components/AssignmentStudentRow.tsx`, `components/SubmissionCard.tsx`, `pages/TeacherAssignmentDetailPage.tsx`, `pages/StudentSubmissionsPage.tsx`
- Test: `__tests__/TeacherAssignmentDetail.test.tsx`, `__tests__/SubmissionCard.test.tsx`

**Interfaces:**
- Produces:
  - `AssignmentInfoPanel({ assignment, onAction })`: nút theo trạng thái (spec §5); không có nút khi `classStatus === 'FINISHED'`;
  - `SubmissionCard({ submission, canComment, onSaveComment(content): Promise<ApiFieldError[] | null> })`.
- [ ] **Step 1: Test:**
  - nút: Nháp → Sửa/Đăng/Xóa; Đã đăng → Sửa/Đóng/Xóa; Đã đóng → Sửa/Mở lại/Xóa; lớp đã kết thúc → không có nút;
  - popup Đóng / Xóa đúng câu MSG-02;
  - hàng sinh viên: "Đạt", "4 lần nộp · gần nhất 16/10 09:30 · cao nhất 82%";
  - `SubmissionCard`: có `<audio>` với `src`; "Gửi nhận xét" khi chưa có, "Cập nhật nhận xét" khi đã có; bộ đếm n/2000; trống → MSG-35; `canComment=false` → textarea chỉ đọc + câu khóa.
- [ ] **Step 2:** FAIL → **Step 3:** cài đặt → **Step 4:** PASS.

---

### Task 10: FE — Trang Admin "Cấu hình chấm điểm" + file âm thanh mẫu

**Files:**
- Create: `BVC-FE/src/features/platform/{api/settingsApi.ts, hooks/useGradingSettings.ts, utils/validateGradingSettings.ts, pages/GradingSettingsPage.tsx}`, `BVC-FE/public/samples/bvc-sample.wav` (sinh bằng script: sóng sin 440 Hz trong 2 giây, 16-bit mono 22 050 Hz)
- Modify: `AdminShell.tsx` (thêm mục "Cấu hình chấm điểm" → `/admin/grading-settings` sau "Lộ trình học tập"), `router.tsx` (route `SYSTEM_ADMIN`)
- Test: `BVC-FE/src/features/platform/__tests__/GradingSettingsPage.test.tsx`
- [ ] **Step 1: Test:**
  - hiển thị 70 / 40 từ API (mock);
  - dòng giải thích "≥ 70%: Đúng tiến độ · 30–69%: Có nguy cơ · < 30%: Chậm tiến độ" đổi theo giá trị nhập;
  - biên > ngưỡng → câu lỗi Global Constraints, không gọi API;
  - Lưu → toast MSG-01.
- [ ] **Step 2:** FAIL → **Step 3:** cài đặt → **Step 4:** PASS. Chạy `npm test && npm run build` → sạch.

---

### Task 11: Kiểm tra cuối

- [ ] BE: `npm run lint && npm run build && npm run test:coverage` → 0 lỗi, mọi test PASS, coverage ≥ 70 %.
- [ ] FE: `npm test && npm run build`; chạy eslint + prettier trên các file đã đổi → sạch.
- [ ] Chrome (BE cổng 3100 + FE cổng 5174, token dev):
  - giảng viên 360 px: tạo nháp → đăng → sửa (v2) → chi tiết → bài nộp của một sinh viên → nghe → nhận xét → cập nhật;
  - đóng / mở lại / xóa; tab "Bài tập" trong lớp;
  - Admin 1440 px: cấu hình 60 / 30 → trạng thái "Đạt" đổi;
  - console không có lỗi.
- [ ] Cập nhật `M03_HuongDan_ChayLocal_Review.md` (seed bài tập, checklist 3a).
- [ ] Review toàn nhánh (reviewer độc lập). Sửa lỗi Critical/Important bằng TDD. Báo cáo: rulings, minor hoãn lại, lệnh commit, mục Q&A.

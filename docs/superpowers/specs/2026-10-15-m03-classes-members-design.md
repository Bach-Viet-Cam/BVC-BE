# M03 · Dự án con 1 — Lớp học, Thành viên, Import SV (FR-M03.01.01 / 01.02 / 01.04)

## Context

`M03_Class_Management_Implementation_Prompt.md` mô tả toàn bộ Module M03 và giả định đã có sẵn "Code v0.9". Thực tế repo mỏng hơn nhiều:
- **BE (`BVC-BE`)**: chỉ có module auth. `User` chỉ có `id/email/username/role`. Chưa có Instrument, Submission, Notification hay Settings, chưa có migration, chưa có test runner.
- **FE (`BVC-FE`)**: các trang `/teacher/*` là mockup desktop với dữ liệu hardcode.

M03 được chia thành 4 dự án con. **Kế hoạch này chỉ cho dự án con 1**, hạn Iteration 1 là 23/10/2026. Dự án con 2 (Lộ trình), 3 (Bài tập) và 4 (Tiến độ + Đánh giá) sẽ có spec và plan riêng.

### Các quyết định đã thống nhất
1. **Phương án A:** tôi tự thêm các model tối thiểu còn thiếu, đánh dấu `// TODO(M0x)`.
2. Dùng **Postgres local bằng Docker** cho dev/test, chuyển sang `prisma migrate` (có baseline). Không động vào DB chung.
3. Dùng **Vitest** cho cả BE và FE.
4. **FE mobile-first cho cả giảng viên và sinh viên, có responsive.** Chỉ làm theo design trong `BVC/UI/`, bỏ mockup desktop cũ của M03. Thiếu design thì phải báo lại, không tự thêm màn hình.
5. **Các phần thiếu design (phương án A):** biến thể và trạng thái của màn đã có thì tôi tự dựng theo style của design và liệt kê để bạn duyệt. Các tab Lộ trình/Bài tập/Tiến độ chỉ hiện nhãn, nội dung để trống. Nút "Xem đánh giá" tạm ẩn.
6. Roadmap theo mô hình UC-11 (§11 #1). Cột `classes.roadmap_id` sẽ được thêm ở dự án con 2.

## Bước 0 — Chuẩn bị
- Repo BE và FE đều chỉ có nhánh `main` (chưa có `develop`). Tôi sẽ tạo nhánh `feature/m03-classes-members` từ `main` ở cả hai repo và ghi chú điểm này trong PR.
- Ghi spec ra `BVC-BE/docs/superpowers/specs/2026-10-15-m03-classes-members-design.md`, gồm nội dung plan này và bảng quyết định §11.

## Phần BE (`BVC-BE`)

### 1. Hạ tầng
- `docker-compose.dev.yml`: chạy `postgres:16`, cổng **5433**, tạo hai DB `bvc_dev` và `bvc_test` qua init script. Thêm các script trong `package.json`: `db:up`, `db:migrate` (`prisma migrate dev`), `db:seed`, `test`, `test:coverage`.
- `.env.example`: thêm `DATABASE_URL` cho local (cổng 5433) và `TEST_DATABASE_URL`. Cập nhật mục 7 trong `.agents/rules/coding-convention.md`.
- **Vitest**: `vitest.config.ts` dùng coverage v8 với `include: src/modules/classes/**`, ngưỡng 70 %. Test tích hợp dùng `supertest` gọi `createApp()` (`src/app.ts`) trên DB `bvc_test`, truncate dữ liệu giữa các test.
- Dependency mới: `multer` (upload qua memory storage, giới hạn 2 MB), `exceljs` (đọc .xlsx và tạo file mẫu; không dùng SheetJS 0.18 vì có CVE), `csv-parse` (đọc CSV, xử lý BOM UTF-8). Dev: `vitest`, `@vitest/coverage-v8`, `supertest`.

### 2. Prisma: baseline + migration `m03_classes_members`
- Migration `0_baseline`: tạo từ schema hiện tại (`users`, `auth_identities`, `auth_sessions`) bằng `prisma migrate diff`, đánh dấu đã apply (`migrate resolve`) để bạn áp dụng lên DB chung.
- Thay đổi schema (`prisma/schema.prisma`):
  - `User`: thêm `status UserStatus @default(ACTIVE)` (`PENDING | ACTIVE | LOCKED`) và `studentCode String? @unique @map("student_code")`. `// TODO(M06)`
  - `Instrument` (`instruments`): `id, name (unique), isActive, createdAt`. `// TODO(M06)`
  - `Class` (`classes`): `name(100), cohort(50), description(500)?, instrumentId, lecturerId, startDate @db.Date, endDate @db.Date, status ClassStatus(ACTIVE|FINISHED), endedAt?, createdAt, updatedAt`. Index `(lecturer_id, status)` và index trên mọi FK.
  - `ClassMember` (`class_members`): `classId, studentId, source(IMPORT|MANUAL), importLogId?, addedById, joinedAt, removedAt?, removedById?`.
  - `StudentImportLog` (`student_import_logs`): `classId, lecturerId, fileName, fileType, totalRows, validRows, errorRows, rows Json, status(PREVIEW|CONFIRMED|CANCELLED), createdAt, confirmedAt?`.
  - `AuditLog` (`audit_logs`): `actorId, action, entityType, entityId, payload Json?, createdAt`. Repo chưa có audit log nên đây là bảng tối thiểu.
- Thêm SQL thủ công vào file migration (Prisma không biểu diễn được):
  - `CREATE UNIQUE INDEX ... ON classes (cohort, lower(name))` (DBR-02, không phân biệt hoa thường)
  - `CREATE UNIQUE INDEX ... ON class_members (class_id, student_id) WHERE removed_at IS NULL`
  - `CREATE UNIQUE INDEX ... ON users (lower(email))`
- Rollback: kèm file `down.sql` trong thư mục migration, vì Prisma không tự sinh migration down.

### 3. Hạ tầng dùng chung (sửa tối thiểu, theo đúng pattern hiện có)
- `src/utils/AppError.ts`: thêm `code?` (ví dụ `'MSG-05'`) và `fieldErrors?: {field, code, message}[]`, cùng các helper `notFound()`, `forbidden()`, `conflict()`.
- `src/middlewares/ErrorMiddleware.ts`:
  - trả thêm `code` và `errors` khi có;
  - ZodError được map thành `errors[]` theo từng trường. Lỗi `too_small`/`required` → MSG-35, `too_big` → MSG-37.
- `src/modules/auth/middleware/AuthMiddleware.ts`: thêm `requireRoles(...roles)`.
- `src/modules/auth/service/AuthService.ts` (`findOrCreateUser`): khi user có sẵn theo email đang ở trạng thái `PENDING` thì chuyển sang `ACTIVE` khi đăng nhập Google lần đầu (GBR-38). User bị `LOCKED` thì báo 401.
- `src/utils/DateTimeUtil.ts` (class static):
  - `todayInVietnam()` dùng `Intl` với `Asia/Ho_Chi_Minh`;
  - `addDays()`;
  - `hasClassStarted(startDate)` (GBR-36: hôm nay theo giờ UTC+7 ≥ ngày bắt đầu).
- `src/constants/MessageConstant.ts`: các template MSG-01…MSG-48 có tham số, cùng hàm `format(code, params)`.
- Module `platform`, tối thiểu cho Instrument: `GET /v1/instruments?active=true` (đã đăng nhập). `// TODO(M06)`

### 4. Module `src/modules/classes/`
Cấu trúc theo `auth`: `route/ controller/ service/ repository/ model/ dto/ validation/ constant/`.
- `ClassService`:
  - `listOwnClasses` (lọc `q`/`cohort`/`instrumentId`/`status`, mặc định ACTIVE, phân trang `page/limit`, trả kèm `activeCount` và danh sách `cohorts` cho bộ lọc);
  - `getClassDetail`, `createClass`, `updateClass`, `endClass`.
  - Các quy tắc:
    - `endDate = startDate + 42 ngày` (GBR-35, §11 #9);
    - không cho ngày bắt đầu trong quá khứ khi tạo;
    - khóa nhạc cụ và ngày bắt đầu khi lớp đã bắt đầu (GBR-36);
    - nhạc cụ phải đang hoạt động;
    - trùng tên trong khóa → 409 với lỗi trường MSG-05;
    - lớp đã kết thúc → 409 MSG-08 (GBR-37).
- `ClassAccessService.assertOwnedClass(classId, lecturerId, {requireActive})`: dùng chung cho mọi route. Không phải chủ lớp → **404**, lớp đã kết thúc → **409**.
- `MemberService`: `listMembers` (tìm theo tên hoặc mã SV, lọc theo trạng thái tài khoản, trả `shown/total`), `addMember`, `removeMember` (xóa mềm: set `removedAt`; thêm lại thì tạo bản ghi thành viên mới, dữ liệu cũ vẫn giữ — GBR-39).
- `StudentRowValidator`: **hàm thuần**, dùng chung cho import và thêm 1 SV.
  - Chuẩn hóa: trim, email viết thường, bỏ qua dòng trống hoàn toàn, không tính dòng tiêu đề.
  - Lý do bỏ qua, theo thứ tự ưu tiên:
    - `Thiếu <trường>`;
    - `Email không hợp lệ`;
    - `Trùng dòng k trong file`;
    - `Đã có trong lớp`;
    - `Mã SV đã thuộc email khác`;
    - `Email đã gắn với mã SV khác`;
    - `Email thuộc tài khoản không phải sinh viên`.
- `ImportFileParser`: kiểm tra đuôi file/MIME → MSG-13, kích thước > 2 MB → MSG-14 (bắt `LIMIT_FILE_SIZE` của multer), > 200 dòng hoặc thiếu cột → MSG-08. Nhận tên cột tiếng Anh và tiếng Việt (`Student Code`/`Mã sinh viên`, `Full Name`/`Họ tên`, `Email`).
- `ImportService`:
  - `previewImport`: lưu log `PREVIEW`, trả về từng dòng.
  - `confirmImport`: trong `prisma.$transaction`, kiểm tra lại toàn bộ các dòng; upsert user ở trạng thái `PENDING` (role STUDENT, `username` = Họ tên) hoặc gán `studentCode` còn thiếu; thêm thành viên; log chuyển sang `CONFIRMED`; trả về số liệu cho MSG-45.
  - `cancelImport`: log chuyển sang `CANCELLED`.
  - `buildTemplate`: tạo file mẫu .xlsx bằng exceljs.
- Audit: ghi log cho tạo/sửa/kết thúc lớp, xác nhận import và xóa thành viên, thông qua `AuditRepository`.
- Route (`/api/v1`, mọi route đều `requireAuthenticatedUser` + `requireRoles(TEACHER)`), đăng ký trong `src/routes/index.ts`:
  ```
  GET    /classes                    POST /classes
  GET    /classes/import-template    GET  /classes/:id      PATCH /classes/:id
  POST   /classes/:id/end
  GET    /classes/:id/members        POST /classes/:id/members
  DELETE /classes/:id/members/:studentId
  POST   /classes/:id/imports (multipart "file")
  POST   /classes/:id/imports/:logId/confirm   POST /classes/:id/imports/:logId/cancel
  ```
- Tài liệu API: `BVC-BE/docs/api/m03-classes.md` (repo chưa có OpenAPI nên viết dạng markdown).

### 5. Seed (`prisma/seed.ts`)
Seed cho dự án con 1:
- 1 admin, 2 giảng viên, 30 sinh viên (8 ở trạng thái PENDING);
- 4 nhạc cụ (Đàn tranh, Đàn bầu, Tỳ bà, Sáo trúc);
- 3 lớp, trong đó 1 lớp đã kết thúc và 1 lớp thuộc giảng viên thứ hai (để test quyền sở hữu).

Seed cho roadmap, bài tập và bài nộp sẽ bổ sung ở các dự án con sau.

## Phần FE (`BVC-FE`)

### 6. Hạ tầng
- Vitest + `@testing-library/react` + `jsdom`, thêm script `test`. Cập nhật `CLAUDE.md` (đoạn ghi "không có test runner").
- `src/shared/components/ProtectedRoute.tsx`: hiện chỉ là `<Outlet/>`. Thêm hỗ trợ `allowedRoles` theo đúng mô tả trong `CLAUDE.md`, đọc từ `useAuth()`: chưa đăng nhập → `/login`, sai role → `/403`.
- `src/shared/components/bvc/MobileAppShell.tsx`: dựng theo design Danh sách lớp. Header gồm "Bách Việt Cầm", chuông thông báo và avatar; thanh tab giảng viên gồm Lớp học/Bài tập/Đánh giá/Thư viện/Thông báo.
  - Responsive: ở mobile chiếm toàn màn hình; từ `md:` trở lên nội dung căn giữa với `max-w-3xl`, danh sách thẻ chuyển thành lưới 2 cột ở `lg:`.
  - Các tab chưa có màn hình thì vẫn hiện nhưng bị vô hiệu hóa.
- Màu và font dùng token `bvc-*` có sẵn trong `src/index.css`. Design dùng đúng bảng màu này; nếu thiếu màu nào thì thêm token, không hardcode.

### 7. Feature `src/features/classes/` (page → hook → api, theo mẫu `features/auth`)
- `api/classesApi.ts`, `types/classTypes.ts`, `utils/validateClassForm.ts`, `utils/validateStudent.ts`, `utils/mapApiErrors.ts` (đổ `errors[]` từ server vào `setError` của react-hook-form).
- Hooks: `useClassList`, `useClassDetail`, `useClassForm`, `useMembers`, `useImportStudents`, `useInstruments`.
- Pages và components, mỗi cái dựng theo một file design:

| Route | Design |
|---|---|
| `/teacher/classes` → `ClassListPage` | `UI/Danh sách lớp` |
| `/teacher/classes/new` và `/teacher/classes/:classId/edit` → `ClassFormPage` | `UI/Form lớp học` (chế độ sửa: tiêu đề "Sửa lớp", khóa trường + ghi chú — biến thể tự dựng) |
| `/teacher/classes/:classId` → `ClassDetailPage` (tab "Thành viên") | `UI/Chi tiết lớp · thành viên` |
| `ImportStudentsDialog` (sheet toàn màn hình trên mobile) | `UI/Nhập danh sách SV` |
| `AddStudentDialog` | `UI/Thêm sinh viên` |

- Gỡ các mockup cũ được thay thế (`ClassListPage`, `ClassFormPage` dạng desktop) và route liên quan trong `src/app/router.tsx`. Các trang M03 còn lại (`RoadmapPage`, `TeacherAssignmentsPage`…) giữ nguyên tới dự án con của chúng.
- Hiển thị ngày dùng `formatDate` (`src/shared/utils/formatDate.ts`). Thông báo dùng `toast` (`ui/toast`).

### 8. Các phần tự dựng — cần bạn duyệt (không phải màn hình mới)
1. Popup xác nhận MSG-02 cho "Kết thúc lớp …?" và "Xóa sinh viên … khỏi lớp?", dùng `ui/dialog` cùng style nút của design.
2. Biến thể "Sửa lớp" của form lớp: trường bị khóa có nền xám và dòng ghi chú "Khóa sau khi lớp bắt đầu".
3. Trạng thái lỗi trong dialog Import: MSG-13, MSG-14, MSG-08 kèm nút "Đổi file"; nút "Nhập N SV" bị vô hiệu khi N = 0.
4. Trạng thái rỗng (MSG-06), không tìm thấy (MSG-07), skeleton khi đang tải, lỗi tải (MSG-09 kèm nút "Thử lại").
5. Lớp đã kết thúc: ẩn các nút Sửa, Kết thúc lớp, Thêm SV, Nhập danh sách SV và Xóa.

### Phần còn thiếu design (chờ bạn gửi)
- Tab "Lộ trình", "Bài tập", "Tiến độ" (hiện để trống) và màn "Xem đánh giá" (tạm ẩn nút).
- Các trang đích của thanh tab: Bài tập, Đánh giá, Thư viện, Thông báo, Hồ sơ.

## Kiểm thử và xác minh
- **BE unit** (Vitest):
  - `DateTimeUtil`: ngày kết thúc = bắt đầu + 42 ngày; biên múi giờ lúc 00:00 UTC+7 (17:00 UTC hôm trước).
  - `StudentRowValidator`: mọi lý do bỏ qua, email viết hoa/thường, dòng trống, tên tiếng Việt UTF-8.
  - `ImportFileParser`: .xlsx, .csv có BOM, > 2 MB, > 200 dòng, thiếu cột, sai định dạng.
  - Service với repository được mock: khóa GBR-36, lớp đã kết thúc (GBR-37), trùng tên trong cùng khóa và cho phép trùng ở khóa khác.
- **BE tích hợp** (supertest + `bvc_test`):
  - happy path cho mọi endpoint;
  - lớp của giảng viên khác → 404; SV gọi API → 403; ghi vào lớp đã kết thúc → 409;
  - xác nhận import chạy trong transaction (một lỗi giữa chừng → không ghi gì);
  - kiểm tra lại khi xác nhận (thêm SV vào lớp sau khi preview → dòng đó bị bỏ qua);
  - xóa mềm rồi thêm lại; tài khoản PENDING chuyển sang ACTIVE khi đăng nhập Google (mock `verifyGoogleCredential`).
- Chạy: `npm run db:up && npm run db:migrate && npm run db:seed && npm test && npm run test:coverage && npm run lint && npm run build`. Coverage của `src/modules/classes/**` phải ≥ 70 %.
- **FE**:
  - test component: validate form lớp (bỏ trống, quá độ dài, lỗi MSG-05 từ server), trường bị khóa khi sửa, dialog Import (vô hiệu nút khi 0 dòng hợp lệ);
  - `npm test && npm run lint && npm run typecheck`.
- **Kiểm tra thủ công:** `npm run dev` ở cả BE và FE, đăng nhập bằng tài khoản giảng viên seed (cần `GOOGLE_CLIENT_ID`, hoặc bạn đăng nhập tay). Chạy hết luồng tạo lớp → import file mẫu có dòng lỗi → xác nhận → xóa SV → kết thúc lớp, ở bề rộng 360 px và desktop (dùng Claude in Chrome nếu bạn cho phép). Đo thời gian: tạo lớp + import ≤ 10 phút.

## Sau khi xong
Báo cáo ngắn: file và migration đã thêm/sửa, cách chạy test và seed, các điểm `TODO(M06)`, và danh sách §11 đưa vào mô tả PR. Sau đó bắt đầu brainstorm dự án con 2 (Lộ trình).
## Phụ lục — Quyết định SRS (§11 của prompt, ghi vào Q&A sheet)

| # | Issue in SRS | Default used in this implementation |
|---|---|---|
| 1 | Roadmap ownership: UC-11 (admin, per instrument, versioned, lecturer read-only) vs FR III.3.3.2–3.3.3 (lecturer edits week content, "Sao chép từ lớp khác") | Follow **UC-11** (§4.4) |
| 2 | **GBR-66 and GBR-67** are referenced (roadmap read-only, roadmap versioning) but not defined in Appendix V.1 | Implement as described in UC-11; ask the BA to add the rules |
| 3 | **MSG-53** is used both as "roadmap saved" and "exercise unavailable" but is not defined; **MSG-LIB-02** is undefined | Saved → MSG-01 "Lưu lộ trình thành công."; unavailable exercise → MSG-48 wording |
| 4 | UC-14 cites **GBR-61** for "Phân Loại", **GBR-62** for assignment versioning and **GBR-59** for supplementary exercises, but those IDs are about submission retry and analysis files | Implement the behaviour written in UC-14; ask the BA to renumber |
| 5 | GBR-25 cites GBR-15 for "Từ chối not counted"; the correct rule is GBR-13 | Exclude "Từ chối" and "Lỗi xử lý" from the count |
| 6 | Rubric: UC-14 says "scale or weight"; FR says scores 0–10 with weights | Fixed 0–10 scale, weights in % summing to 100 |
| 7 | GBR-02: "average accuracy across the class's assignments" does not say which submission counts | Best completed submission per assignment, averaged |
| 8 | Glossary: the Solo/Ensemble exam "is assigned when the class is created", but the class form has no exam field | Not implemented in the class form; the exam is created as a normal assignment. Ask the BA |
| 9 | End date "start + 6 weeks" vs week 6 ending on start + 41 days | Store end_date = start + 42 days, as GBR-35 states literally; week cards use 7-day windows |
| 10 | Whether a class auto-ends after its end date | Manual only ("Kết thúc lớp"); no automatic job |
| 11 | Whether "Nhận xét" is required when a rubric exists | Optional when a rubric exists, required when there is none |
| 12 | UC-12 references SCR-M03-06 / SCR-M06-03 IDs that differ from the Screen List numbering | Use the Screen List (#15–#26) as the reference |

---


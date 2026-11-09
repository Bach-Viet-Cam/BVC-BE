# Giảng viên cùng dạy (n-n lớp ↔ giảng viên) — Design

Ngày: 2026-11-08 · Phạm vi: BVC-BE + BVC-FE

## Vì sao

Chính sách mới: một lớp có thể có nhiều hơn một giảng viên (có lớp 2, có lớp 3). Hiện tại mỗi lớp chỉ có
đúng một giảng viên (`classes.owner_id`) và toàn hệ thống kiểm tra quyền bằng `class.ownerId === user`.
Không có vấn đề vận hành nào đang bị vướng; đây là thay đổi để đáp ứng chính sách.

## Mục tiêu

- Form tạo lớp cho phép gắn thêm giảng viên cùng dạy, không giới hạn số lượng.
- Giảng viên cùng dạy có **đầy đủ chức năng như giảng viên chính** trên lớp đó.
- DB lưu quan hệ n-n giữa lớp và giảng viên.
- Sau khi tạo lớp, giảng viên chính quản lý (thêm/gỡ) giảng viên cùng dạy.

## Không làm

- Không có phân quyền chi tiết theo từng giảng viên cùng dạy (không có vai trò "trợ giảng chỉ xem", v.v.).
- Không có chuyển quyền giảng viên chính sang người khác.
- Không thay đổi quyền sở hữu của bản nhạc (Piece/SheetMusic), audio upload, thử thách (Challenge) — các
  `ownerId`/`lecturerId` đó thuộc về tài nguyên cá nhân, không phải lớp.

## Anti-goal

- Giảng viên cùng dạy bị lọt chỗ nào đó vẫn trả 404/403 (một chỗ kiểm tra `ownerId` bị bỏ sót) — coi như
  tính năng hỏng dù form vẫn chạy.
- Giảng viên cùng dạy thêm/gỡ được giảng viên khác.

## Quyết định của người dùng

1. **Giảng viên chính** = người tạo lớp. Chỉ khác giảng viên cùng dạy ở một điểm: **chỉ giảng viên chính
   được thêm/gỡ giảng viên cùng dạy**.
2. Mọi việc khác — sửa thông tin lớp, kết thúc lớp, thêm/gỡ/import học viên, giao/sửa/xóa bài tập, nhận xét,
   duyệt bài nộp, xem tiến độ, gắn lớp vào thử thách, quản lý nội dung được xác thực — giảng viên cùng dạy
   đều làm được.
3. Chọn giảng viên bằng **combobox gõ email**.
4. Vị trí UI và cấu trúc DB như phần dưới (đã duyệt).
5. **Chặn thử thách trùng thời gian theo lớp** (không còn theo từng giảng viên): một lớp không được có hai
   thử thách trùng thời gian, dù do giảng viên chính hay giảng viên cùng dạy tạo.
6. **Gỡ giảng viên cùng dạy không đụng tới thử thách của họ**: liên kết thử thách ↔ lớp giữ nguyên, thử thách
   đã đăng vẫn chạy cho lớp đó. Hệ quả chấp nhận được: sau khi bị gỡ, người đó sửa phần lớp hoặc publish thử
   thách đó sẽ nhận 404 "không tìm thấy lớp" như hiện tại.

## Thiết kế

### DB (`prisma/schema.prisma`)

- **Giữ** `classes.owner_id` = giảng viên chính.
- Thêm model mới, ví dụ:

```prisma
// Giảng viên cùng dạy của lớp (không gồm giảng viên chính, người đó nằm ở classes.owner_id).
model ClassLecturer {
  id         String   @id @default(uuid())
  classId    String   @map("class_id")
  lecturerId String   @map("lecturer_id")
  addedById  String   @map("added_by")
  createdAt  DateTime @default(now()) @map("created_at")
  class      Class    @relation(fields: [classId], references: [id])
  lecturer   User     @relation("ClassLecturerLecturer", fields: [lecturerId], references: [id])
  addedBy    User     @relation("ClassLecturerAddedBy", fields: [addedById], references: [id])

  @@unique([classId, lecturerId])
  @@index([lecturerId])
  @@map("class_lecturers")
}
```

- Thêm `coLecturers ClassLecturer[]` vào `Class` và hai relation ngược vào `User`.
- Migration tạo bằng `npx prisma migrate dev --name add-class-lecturers` (quy tắc repo: không tự viết file
  migration, không `db push`). Không cần backfill: lớp cũ chỉ có giảng viên chính.
- *Builder's call:* bảng chỉ chứa giảng viên cùng dạy (không lặp lại giảng viên chính) để `owner_id` là nguồn
  duy nhất cho "ai là chính". Gỡ giảng viên cùng dạy = xóa cứng dòng, ghi `AuditLogger`.

### BE — kiểm tra quyền

Khái niệm mới: **"giảng viên của lớp"** = `ownerId === userId` **hoặc** có dòng `ClassLecturer(classId, userId)`.

- Tạo một chỗ dùng chung (ví dụ trong `ClassAccessService`) gồm:
  - hàm kiểm tra trên bản ghi lớp đã load (`isClassLecturer(classRecord, userId)`), yêu cầu select kèm
    `coLecturers: { select: { lecturerId: true } }`;
  - một Prisma `where` fragment cho truy vấn danh sách:
    `{ OR: [{ ownerId: userId }, { coLecturers: { some: { lecturerId: userId } } }] }`.
- `assertOwnedClass` đổi sang "là giảng viên của lớp". Thêm `assertPrimaryLecturer` cho các endpoint quản lý
  giảng viên cùng dạy.
- Các chỗ hiện đang so `ownerId` phải chuyển sang khái niệm mới (danh sách đã tìm, builder grep lại
  `ownerId` và các `where` lọc lớp theo giảng viên để chắc không sót):
  - `classes/service/ClassAccessService.ts`
  - `classes/repository/ClassRepository.ts` — danh sách lớp, `countActiveClasses`, `findCohorts`
  - `classes/repository/ProgressRepository.ts`, `classes/service/ProgressService.ts`
  - `assignments/repository/AssignmentRepository.ts` (`class: { ownerId }`), `assignments/model/AssignmentModel.ts`,
    `assignments/service/AssignmentAccessService.ts`
  - `assignments/repository/SubmissionRepository.ts`, `assignments/service/SubmissionCommentService.ts`
  - `challenges/repository/ChallengeRepository.ts`, `challenges/service/ChallengeReferenceService.ts`
    (chỉ phần kiểm tra lớp được gắn vào thử thách; quyền sở hữu thử thách giữ nguyên)
  - `community/service/SubmissionReviewService.ts`, `community/service/VerifiedPolicyService.ts`,
    `community/dto/VerifiedDTO.ts`
  - `platform/repository/UserRepository.countActiveClassesOwnedBy` — chặn đổi role khi giảng viên còn lớp
    đang hoạt động: tính cả lớp đang cùng dạy.
  - Các truy vấn trang chủ giảng viên (bài nộp hôm nay, học viên cần chú ý…) nếu lọc theo `ownerId`/`lecturerId`
    của lớp.
  - Kiểu `src/types/ClassTypes.d.ts`, `AssignmentTypes.d.ts`.
- Hành vi lỗi giữ như hiện tại: lớp mà user không phải giảng viên → 404 (không lộ sự tồn tại). Giảng viên cùng
  dạy gọi endpoint quản lý giảng viên → 403.

### BE — API

- **Quy tắc tài khoản hợp lệ** (dùng chung cho tạo lớp, thêm giảng viên và lookup): role giảng viên (role 2)
  và `status !== LOCKED` — tức PENDING (admin vừa tạo, chưa đăng nhập) vẫn gắn được. *(Claude's call, người
  dùng có thể sửa.)*
- `POST /classes`: thêm field tùy chọn `coLecturerIds: string[]` (mặc định `[]`). Validation: bỏ trùng, không
  chứa chính người tạo, mỗi id phải thỏa quy tắc tài khoản hợp lệ ở trên; sai → lỗi field
  `coLecturerIds` bằng tiếng Việt. Tạo lớp + các dòng `ClassLecturer` trong cùng transaction.
- `GET /classes/:id` (detail): trả thêm `owner` `{ id, name, email }`, `coLecturers: [{ id, name, email }]`
  và `isPrimaryLecturer: boolean` cho user hiện tại.
- Danh sách lớp: trả các lớp user là giảng viên chính hoặc cùng dạy. *Builder's call:* thêm
  `isPrimaryLecturer` vào item để FE có thể hiển thị nhãn nếu cần.
- Tìm giảng viên theo email cho combobox: `GET /classes/lecturers/lookup?email=...` (chỉ role giảng viên,
  khớp tiền tố/chứa, giới hạn ~10 kết quả, loại chính user gọi). Không phụ thuộc lớp nên dùng được trong form tạo.
  Đặt trước route `/:id` để không bị nuốt.
- Quản lý sau khi tạo (chỉ giảng viên chính, lớp phải ACTIVE theo GBR-37 giống các thao tác ghi khác):
  - `POST /classes/:id/lecturers` body `{ lecturerId }` → 201; trùng → 409.
  - `DELETE /classes/:id/lecturers/:lecturerId` → 204.
- Message mới vào `ClassConstant.messages`, tiếng Việt có dấu. Theo convention trong
  `.agents/rules/coding-convention.md` (một class mỗi file, tên file PascalCase có hậu tố tầng).

### BE — thử thách trùng thời gian (đổi hành vi)

- `ChallengeRepository.findOverlappingClassIds` hiện lọc `challenge.createdById = lecturerId` + `classId in
  classIds`. Bỏ điều kiện `createdById`: kiểm tra trùng trên **mọi** thử thách (đã publish/đang tính trùng như
  logic hiện tại) gắn với các lớp đó.
- Advisory lock trong `lockLecturer` (khóa theo giảng viên) đổi thành khóa theo lớp — khóa từng `classId`
  theo thứ tự sắp xếp cố định để tránh deadlock khi hai giảng viên cùng publish trên các lớp giao nhau.
- Thông báo lỗi trùng: nếu message hiện tại ngụ ý "bạn đã có thử thách…", đổi sang câu trung tính kiểu "Lớp …
  đã có thử thách trong khoảng thời gian này" (tiếng Việt có dấu).
- Test riêng: giảng viên chính và giảng viên cùng dạy publish hai thử thách trùng tuần trên cùng lớp → cái thứ
  hai bị chặn; khác lớp hoặc không trùng thời gian → được.

### BE — gỡ giảng viên cùng dạy

- Chỉ xóa dòng `ClassLecturer` + ghi audit. Không động vào `ChallengeClass`, bài tập, nhận xét, bài duyệt mà
  người đó đã tạo — tất cả vẫn thuộc lớp.

### FE

Theo `docs/RULES.md` và mẫu `features/classes` hiện có (api → hook → component).

**Form "Tạo lớp học"** (`ClassForm` / `ClassCreateDialog`, mở tại `/teacher/classes?create=class`):

- Trường mới **"Giảng viên cùng dạy"**, không bắt buộc, đặt ngay dưới "Mô tả", trên "Ngày bắt đầu/Ngày kết thúc".
- Combobox: gõ email → gợi ý (tên + email) từ API lookup (debounce). Chọn → chip có ✕ để bỏ. Không giới hạn số
  lượng. Ẩn người đã chọn khỏi gợi ý.
- Gửi `coLecturerIds` khi tạo. Hiển thị lỗi field từ BE qua `mapApiErrors`.
- Đổi mô tả đầu form thành: "Sau khi tạo lớp, bạn thêm sinh viên hoặc nhập danh sách từ file và quản lý giảng
  viên cùng dạy trong trang chi tiết lớp."
- Form **sửa** lớp: không có trường này (quản lý ở trang chi tiết).

**Trang chi tiết lớp** (`ClassInfoPanel`):

- Mục "Giảng viên": giảng viên chính có nhãn "Chính", sau đó là danh sách giảng viên cùng dạy (tên + email).
- Nếu `isPrimaryLecturer`: combobox email để thêm và nút gỡ trên từng người (có xác nhận trước khi gỡ).
  Lớp đã kết thúc → chỉ xem (dùng `ClassWriteGuard` như các thao tác ghi khác).
- Giảng viên cùng dạy: chỉ xem danh sách.
- Mọi màn khác của giảng viên (danh sách lớp, trang chủ, bài tập, tiến độ, duyệt bài) không đổi UI — chỉ cần BE
  trả đúng dữ liệu.

## Kiểm thử

- BE (vitest): với mỗi nhóm quyền ở danh sách trên, có ít nhất một test chứng minh giảng viên cùng dạy truy cập
  được và giảng viên không liên quan vẫn bị 404/403. Test tạo lớp với `coLecturerIds` hợp lệ/không hợp lệ;
  test thêm/gỡ: chính được, cùng dạy bị 403, trùng bị 409, lớp ENDED bị chặn.
- FE (Vitest + Testing Library): combobox chọn/bỏ chip và gửi đúng payload; `ClassInfoPanel` hiện/ẩn nút quản lý
  theo `isPrimaryLecturer`.

## Để builder tự quyết

- Tên chính xác của hàm/route/hook, cách tách component combobox (có thể tái dùng `FilterCombobox` nếu hợp).
- Cách tối ưu truy vấn quyền (load kèm `coLecturers` hay `findFirst` riêng).
- Thứ tự sắp xếp danh sách giảng viên cùng dạy (mặc định theo thời điểm thêm).

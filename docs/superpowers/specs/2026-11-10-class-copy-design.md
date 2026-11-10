# Sao chép lớp khi tạo lớp mới — Design

Ngày: 2026-11-10 · Phạm vi: BVC-BE + BVC-FE · Nhánh: `feature/m03-classes-members` (cả BE và FE)

## Vì sao

Mỗi học kỳ giảng viên mở lại các lớp gần giống học kỳ trước: cùng môn, cùng mô tả, cùng nhóm giảng viên và
cùng bộ bài tập luyện tập. Hiện phải nhập lại toàn bộ bằng tay rồi tạo từng bài. Tính năng này cho phép
chọn một lớp có sẵn làm nguồn ngay trong modal "Tạo lớp học", sửa những gì cần rồi lưu một lần.

## Mục tiêu

- Trong modal "Tạo lớp học" có nút **"Sao chép từ lớp khác"** → chọn lớp nguồn, kèm thông tin nói rõ sẽ sao
  chép những gì.
- Chọn xong, form được điền sẵn: mã lớp, mô tả, giảng viên cùng dạy. Giảng viên vẫn sửa mã lớp và học kỳ
  như bình thường.
- Modal liệt kê bài tập của lớp nguồn, mỗi bài có ô tick (mặc định tick hết); bỏ tick để không sao chép bài
  đó; nút **Sửa** để sửa nội dung bài trước khi lưu.
- Bấm "Tạo lớp" → tạo lớp mới **và** các bài đã tick trong **một transaction** (tất cả hoặc không gì cả).

## Không làm

- Không sao chép sinh viên, bài nộp, nhận xét, lịch sử import, rubric, lịch sử version của bài tập.
- Không sao chép lộ trình: lớp mới vẫn gắn lộ trình mới nhất của nhạc cụ như luồng tạo lớp hiện tại.
- Không có endpoint clone riêng; không sửa luồng "Giao bài cho lớp khác" (`POST /assignments/assign`).
- Không gửi thông báo khi tạo bài sao chép (lớp mới chưa có thành viên).
- Không đổi luồng tạo lớp khi không dùng sao chép.

## Anti-goal

- Lớp mới được tạo nhưng chỉ có một phần bài tập vì một bài lỗi giữa chừng.
- Lớp mới có 2 bài SOLO hoặc 2 bài ENSEMBLE, hoặc bài gắn bản nhạc không dùng được cho nhạc cụ của lớp.
- Giảng viên sao chép được lớp mình không dạy.

## Quyết định của người dùng

1. **Lớp nguồn**: mọi lớp người dùng dạy (giảng viên chính hoặc cùng dạy), mọi học kỳ, kể cả lớp đã kết thúc.
2. **Trạng thái bài sao chép**: giữ nguyên — DRAFT → DRAFT; PUBLISHED và CLOSED → PUBLISHED.
3. **Giảng viên cùng dạy**: điền sẵn từ lớp nguồn, vẫn thêm/gỡ được.
4. **Sửa bài**: dialog con xếp chồng; "Áp dụng" chỉ đổi dữ liệu trong bộ nhớ, chưa ghi DB.
5. **Cách làm**: mở rộng `POST /classes` với danh sách bài tập (approach A), không để FE gọi từng API.

## Backend

### 1. `GET /classes/:id/copy-source` (mới)

- Quyền: giảng viên chính hoặc giảng viên cùng dạy của lớp (`ClassAccessService`, không yêu cầu lớp ACTIVE).
  Không có quyền → 404 như các endpoint lớp khác.
- Validation: dùng lại `ClassValidation.classIdSchema`.
- Response:

```ts
interface ClassCopySourceDTO {
  id: string;
  name: string;
  cohort: string;
  description: string | null;
  instrument: { id: string; name: string };
  // Giảng viên chính và các giảng viên cùng dạy của lớp nguồn, bỏ người gọi.
  coLecturers: Array<{ id: string; fullName: string; email: string }>;
  assignments: Array<{
    id: string;                   // id bài nguồn, chỉ để FE làm khoá dòng và ghi audit
    title: string;
    kind: 'SOLO' | 'ENSEMBLE' | 'BONUS' | 'OTHER';
    description: string | null;
    sheetMusic: { id: string; title: string } | null;
    requiredBpm: number | null;
    status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  }>;
}
```

- `assignments`: bài có `deletedAt = null` và có `currentVersion`; nội dung lấy từ version hiện tại. Thứ tự:
  SOLO, ENSEMBLE, rồi các bài còn lại theo `createdAt` tăng dần.
- Kiểu dữ liệu `coLecturers` giống kiểu FE `Lecturer` đang dùng cho `LecturerPicker`.
- Danh sách lớp để chọn nguồn **không cần endpoint mới**: dùng `GET /classes?status=ALL`.

### 2. `POST /classes` — thêm `assignments` và `sourceClassId`

Body mở rộng (các trường cũ không đổi):

```ts
{
  // ...name, cohort, instrumentId, description, coLecturerIds
  sourceClassId?: string;                 // chỉ để ghi audit
  assignments?: Array<{                   // mặc định [], tối đa 50
    title: string;
    kind: AssignmentKind;
    description?: string | null;
    sheetMusicId?: string | null;
    requiredBpm?: number | null;
    status: 'DRAFT' | 'PUBLISHED';
  }>;
}
```

- Validation: mỗi phần tử dùng đúng `content` của `AssignmentValidation` (tên, mô tả, loại, bản nhạc, BPM)
  cộng thêm `status`. Để dùng chung, `content` được export thành
  `AssignmentValidation.contentShape`. Không chấp nhận `CLOSED` (FE tự đổi sang `PUBLISHED`).
- `sourceClassId` nếu có phải là lớp người gọi dạy; nếu không → 404. Chỉ dùng cho audit.
- Kiểm tra trước transaction trong `ClassService.createClass` (sau các kiểm tra lớp hiện có), qua service
  thuần mới `ClassCopyPolicyService.findAssignmentErrors(assignments, instrumentId, selectableSheets)`:
  - Tối đa 1 SOLO và 1 ENSEMBLE (`AssignmentConstant.singleKinds`). Lỗi gắn vào **mọi** dòng bị trùng
    loại, field `kind`.
  - `sheetMusicId` phải chọn được cho `instrumentId`: service gọi
    `AssignmentRepository.isSheetMusicSelectable(sheetMusicId, instrumentId)` cho từng bản nhạc khác nhau
    (cùng kiểm tra với luật `SHEET_UNAVAILABLE` của assign) rồi truyền tập kết quả vào policy. Lỗi field
    `sheetMusicId`.
  - Có lỗi → 400 với `fieldErrors` (cùng mã với lỗi bản nhạc hiện có), `field = "assignments.<index>.<field>"`, message tiếng Việt có dấu.
- Trong transaction hiện có của `createClass`, sau khi tạo lớp và giảng viên cùng dạy, với mỗi bài theo thứ tự gửi lên:
  1. Tạo `Assignment`: `classId` mới, `deadline` = `endDate` của lớp, `status`, `publishedAt = now` nếu
     PUBLISHED, `createdById` = người gọi, các trường mirror (title/type/description/sheetMusicId/targetBpm/
     isPublished) như `createAssignment` đang làm.
  2. `AssignmentRepository.createVersionAndMakeCurrent(id, 1, content, lecturerId, transaction)`.
  3. Audit `CREATE` của bài tập, payload `{ status, copiedFromClassId: sourceClassId ?? null }`.
- Audit `CLASS_CREATE` thêm `sourceClassId` và `assignmentCount`.
- Việc tạo bài được tách thành `AssignmentService.createManyInTransaction(classId, lecturerId, items,
  endDate, transaction)`, dùng lại phần dựng dữ liệu của `createAssignment` để không lặp code.
- Response giữ nguyên `ClassDetailDTO`. Message: `Tạo lớp thành công.` khi không có bài, `Đã tạo lớp và sao chép N bài tập.` khi N > 0.

### 3. Bản nhạc chọn được theo nhạc cụ

`AssignmentValidation.sheetMusicSchema` nhận **đúng một** trong hai: `classId` hoặc `instrumentId` (uuid).
Với `instrumentId`, trả về cùng tập bản nhạc như khi truyền một lớp của nhạc cụ đó. Dùng cho dialog sửa bài
khi lớp chưa tồn tại.

### Test BE

- `ClassCopyPolicyService.test.ts`: 2 SOLO → lỗi trên cả hai dòng; 1 SOLO + 1 ENSEMBLE + nhiều OTHER/BONUS
  → hợp lệ; bản nhạc không thuộc nhạc cụ → lỗi `assignments.<i>.sheetMusicId`; không có bài → hợp lệ.
- `ClassValidation` test: `assignments` mặc định `[]`, từ chối `status: 'CLOSED'`, từ chối quá 50 bài,
  từ chối tên trống.
- `AssignmentValidation` test: `sheetMusicSchema` từ chối khi thiếu cả hai hoặc có cả hai tham số.

## Frontend

### 1. Chọn lớp nguồn

- `ClassCreateDialog` thêm thanh phía trên form:
  - Chưa chọn: nút **"Sao chép từ lớp khác"**.
  - Đã chọn: *"Đang sao chép từ {mã lớp} ({học kỳ}) · Đổi lớp · Bỏ sao chép"*. "Bỏ sao chép" đưa form về
    trạng thái trống như khi mới mở modal.
- `CopySourcePickerDialog` (mới, dialog xếp chồng):
  - Hộp info: *"Sẽ sao chép: mã lớp, mô tả, giảng viên cùng dạy và toàn bộ bài tập (nội dung, loại, bản nhạc,
    BPM, trạng thái). Không sao chép: sinh viên, bài nộp, lộ trình — lớp mới tự lấy lộ trình mới nhất của
    nhạc cụ."*
  - Ô tìm kiếm + danh sách lớp từ `GET /classes?status=ALL&q=…`; mỗi dòng: mã lớp, học kỳ, nhạc cụ.
  - Chọn lớp → gọi `copy-source` → đóng dialog và điền form. Lỗi tải → toast, dialog vẫn mở.

### 2. Điền sẵn `ClassForm`

- Prop mới `prefill?: { name; description; coLecturers }`. Đổi prefill → `reset()` form và đặt lại
  `coLecturers`.
- **Học kỳ không lấy từ lớp nguồn** (thường đã qua): logic hiện có chọn học kỳ theo half trong mã lớp.
- Môn học tiếp tục tự suy ra từ mã lớp.
- Mô tả copy sang được giữ: `lastAutoDescription` được đặt lại khi reset để logic tự sinh mô tả không ghi đè.
- Form bị coi là đã sửa (dirty) khi đã chọn lớp nguồn, để đóng modal có hỏi lại.

### 3. `CopyAssignmentList` (mới)

- Nằm cuối form (trước ngày bắt đầu/kết thúc), chỉ hiện khi đang sao chép. Tiêu đề
  "Bài tập sẽ sao chép ({số tick}/{tổng})" và nút "Chọn tất cả / Bỏ chọn tất cả". Lớp nguồn không có bài →
  dòng chữ "Lớp nguồn chưa có bài tập".
- Mỗi dòng: nút checkbox (mặc định tick), tên bài, `AssignmentKindTag`, nhãn trạng thái sau khi sao chép
  ("Nháp" / "Đã đăng"), tên bản nhạc, BPM, nút **Sửa**. Không dùng lại `AssignSelectRow` vì nó là một
  `<button>` (không lồng nút Sửa được); dòng mới dùng cùng style, checkbox và nút Sửa là hai nút riêng.
- Dòng có lỗi: viền đỏ + thông báo dưới dòng.
- Nhạc cụ suy ra từ mã lớp khác nhạc cụ lớp nguồn → cảnh báo chung trên danh sách:
  *"Nhạc cụ khác lớp nguồn — một số bản nhạc có thể không dùng được."*

### 4. `CopyAssignmentEditDialog` (mới)

- Tách các field nội dung của `AssignmentForm` (tên, loại, mô tả, bản nhạc, BPM) thành component
  `AssignmentContentFields`, dùng chung cho `AssignmentForm` và dialog mới. `AssignmentForm` không đổi hành vi.
- Schema: dùng lại `assignmentFormSchema` (bỏ `classId` qua `.omit`).
- Bản nhạc: `useClassSheetMusic` nhận `{ classId } | { instrumentId }`; dialog truyền nhạc cụ suy ra từ mã
  lớp đang nhập. Bản nhạc hiện tại không có trong danh sách → vẫn hiện như `currentSheetMusic` của
  `AssignmentForm`.
- "Áp dụng" cập nhật dòng trong bộ nhớ và xoá lỗi của dòng đó; "Hủy" bỏ thay đổi.

### 5. State: `useClassCopy` (hook mới)

Quản lý: lớp nguồn, trạng thái tải, danh sách dòng `{ key (id bài nguồn), checked, content, status, error }`,
và các hành động `selectSource`, `clear`, `toggle`, `toggleAll`, `updateContent`, `applyServerErrors`,
`toPayload`. `ClassForm` chỉ nhận dữ liệu qua props.

### 6. Kiểm tra trước khi gửi và lưu

- Tick quá 1 SOLO hoặc quá 1 ENSEMBLE → chặn gửi, báo lỗi trên các dòng đó (cùng message với BE).
- Payload gửi kèm `sourceClassId` và `assignments` = các dòng được tick theo thứ tự hiển thị, CLOSED đổi thành
  PUBLISHED.
- Lỗi `assignments.<i>.<field>` → map index về dòng được tick thứ i; các lỗi field khác đi qua
  `applyFieldErrors` như hiện tại.
- Thành công → toast message của server → chuyển đến trang chi tiết lớp mới.

### Test FE (Vitest)

- `ClassForm.test`: có prefill → mã lớp, mô tả, giảng viên cùng dạy được điền; học kỳ theo half của mã lớp;
  mô tả copy sang không bị ghi đè bởi mô tả tự sinh.
- `CopyAssignmentList.test`: mặc định tick hết; bỏ tick loại bài khỏi payload; 2 SOLO được tick → chặn gửi
  và hiện lỗi; sửa bài → payload mang nội dung mới; CLOSED → PUBLISHED trong payload.
- `useClassCopy` / map lỗi: `assignments.1.sheetMusicId` gắn vào đúng dòng được tick thứ hai, kể cả khi có
  dòng bỏ tick xen giữa.

## Rủi ro và lưu ý

- DB dev remote thiếu migration; tính năng này **không cần migration** (không đổi `schema.prisma`), nhưng
  kiểm thử UI vẫn cần DB local đã có schema M03.
- Bài nguồn không có `currentVersion` (dữ liệu cũ, trước khi có `AssignmentVersion`) **bị bỏ qua** khỏi
  `copy-source`, giống cách `assignToClasses` đang lọc nguồn.

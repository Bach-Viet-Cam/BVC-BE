# M03 · Dự án con 3a — Bài tập phía giảng viên (FR-M03.03.01/02)

Ngày: 16/10/2026 · Nhánh: `feature/m03-classes-members` (cả BE và FE) · Phụ thuộc: dự án con 1 (lớp, thành viên) và 2 (lộ trình, `pieces`).

## 1. Mục tiêu và phạm vi

Bài tập là **bài đăng luyện tập**: giảng viên đăng cho cả lớp biết cần luyện gì. Sinh viên thu âm và gửi nhiều lần để hệ thống phân tích lỗi (M01). Giảng viên **không chấm điểm** và không duyệt kết quả AI; giảng viên xem số liệu, nghe lại bản thu, và **nhận xét từng bài nộp**.

Mô hình này do người dùng quyết định ngày 16/10, **thay** UC-14 / UC-13 trong prompt (§4.3, §4.6). Cụ thể **bỏ**:
- rubric (FR-M03.03.03), chấm điểm, lịch sử phiên bản nhận xét;
- hạn nộp, số lần nộp tối đa, độ chính xác tối thiểu riêng từng bài;
- giao cho từng sinh viên, tuần lộ trình, độ khó, điểm bonus, form riêng cho Bonus;
- thêm bài nhạc mới ngay trong form.

Trong phạm vi:
- cấu hình chấm điểm của Admin;
- vòng đời bài tập (nháp, đăng, sửa có phiên bản, đóng/mở lại, xóa mềm);
- màn giảng viên (danh sách, form, chi tiết, bài nộp của một sinh viên, nhận xét);
- bảng `submissions` tối thiểu, thông báo tối thiểu, và `canSubmit` cho M01.

Ngoài phạm vi:
- dự án con 3b: "Bài tập của tôi", chi tiết bài tập phía sinh viên (có danh sách bài nộp và nhận xét của chính sinh viên);
- dự án con 4: theo dõi tiến độ theo 3 trạng thái;
- M01: thu âm, gửi bài, phân tích, màn kết quả;
- M06: màn thông báo, màn cấu hình hệ thống thật.

## 2. Quyết định của người dùng (16/10/2026)

| # | Nội dung | Quyết định |
|---|---|---|
| A1 | Bài nộp (M01) chưa có | Tạo bảng `submissions` tối thiểu (`TODO(M01)`) |
| A2 | Loại bài | `SOLO` Độc tấu · `ENSEMBLE` Hòa tấu · `BONUS` Bonus · `OTHER` Bài tập khác (một form chung) |
| A3 | Hạn nộp | Không có. Nộp không giới hạn số lần khi bài đang mở và lớp đang hoạt động |
| A4 | Theo dõi "ai yếu" | 3 trạng thái tiến độ theo ngưỡng do **Admin cấu hình**, áp dụng mọi bài. Khởi tạo `minAccuracy = 70`, `atRiskMargin = 40`. Cả hai là số nguyên 0–100, biên ≤ ngưỡng |
| A5 | Nơi Admin cấu hình | M03 làm bảng `system_settings` (`TODO(M06)`), API, và trang "Cấu hình chấm điểm" dùng `AdminShell` |
| A6 | Nhận xét | Gắn với **từng bài nộp**, tối đa 1 nhận xét / bài nộp. Sửa thì ghi đè, chỉ giữ bản mới nhất |
| A7 | Sinh viên xem bài nộp | Trong chi tiết bài tập phía sinh viên (3b) |
| A8 | Trường của form | Tiêu đề *, Mô tả, Loại *, Bài nhạc (không bắt buộc), BPM yêu cầu. Luôn giao cho **cả lớp** |
| A9 | Vòng đời | Lưu nháp; Đăng; Sửa = phiên bản mới (bài nộp giữ phiên bản lúc nộp); Đóng + Mở lại; Xóa mềm; Thông báo khi đăng và khi sửa bài đang đăng |
| A10 | Xóa | Xóa mềm: ẩn với mọi người; bài nộp của bài đã xóa **không** tính vào tiến độ |
| A11 | Chi tiết bài (giảng viên) | Mỗi sinh viên: trạng thái Chưa nộp / Đã nộp / Đạt + số lần nộp, lần gần nhất, độ chính xác cao nhất. Bấm vào sinh viên → các lần nộp, mỗi lần có nghe lại + ô nhận xét |
| A12 | Thông báo nhận xét | Chỉ khi gửi lần đầu |
| A13 | BPM yêu cầu | Số nguyên 1–300, không bắt buộc. Bỏ trống = BPM mặc định của bài nhạc |
| A14 | Mô tả | Tối đa 1000 ký tự |
| A15 | Bài nhạc | Chỉ chọn bài có sẵn: mọi `pieces` đang hiển thị, cùng nhạc cụ với lớp (cả bài nhạc lẫn bài luyện ngón) |
| A16 | Bài đã đóng | Vẫn sửa được |
| A17 | Lớp kết thúc | Mọi bài đang đăng của lớp tự chuyển sang **Đã đóng**. Lớp chỉ xem nên mọi thao tác ghi bị chặn, kể cả nhận xét |
| A18 | Sinh viên đã bị xóa khỏi lớp | Bài nộp chỉ xem, khóa nhận xét |

## 3. Dữ liệu (migration `m03_assignments`, có `down.sql`)

```text
system_settings      -- TODO(M06)
  key varchar(100) PK, value varchar(500), updated_by FK users NULL, updated_at
  seed rows trong migration: ('grading.minAccuracy','70'), ('grading.atRiskMargin','40')

assignments
  id, class_id FK, created_by FK, status enum(DRAFT, PUBLISHED, CLOSED) default DRAFT,
  current_version_id FK assignment_versions NULL, published_at NULL, closed_at NULL,
  deleted_at NULL, created_at, updated_at
  index (class_id, status)

assignment_versions  -- bất biến sau khi tạo
  id, assignment_id FK, version int, title varchar(200), description varchar(1000) NULL,
  kind enum(SOLO, ENSEMBLE, BONUS, OTHER), piece_id FK pieces NULL, required_bpm int NULL,
  created_by FK, created_at
  UNIQUE (assignment_id, version)

submissions          -- TODO(M01): M01 sẽ ghi bảng này
  id, assignment_id FK, assignment_version_id FK, class_id FK, student_id FK,
  audio_url varchar(500), status enum(PROCESSING, COMPLETED, REJECTED, FAILED),
  accuracy numeric(5,2) NULL, tempo_deviation numeric(6,2) NULL, submitted_at, analyzed_at NULL
  index (assignment_id, student_id), index (class_id, student_id)

submission_comments
  id, submission_id FK UNIQUE, lecturer_id FK, content varchar(2000), created_at, updated_at

notifications        -- TODO(M06)
  id, user_id FK, title varchar(200), body varchar(500), link varchar(300), read_at NULL, created_at
  index (user_id, read_at)
```

## 4. Quy tắc nghiệp vụ (BE)

### 4.1 Cấu hình chấm điểm
- `GET /admin/settings/grading` → `{ minAccuracy, atRiskMargin, updatedAt }`.
- `PUT /admin/settings/grading`:
  - cả hai là số nguyên 0–100, sai thì MSG-03 ("Độ chính xác tối thiểu phải nằm trong khoảng từ 0 đến 100.");
  - `atRiskMargin` ≤ `minAccuracy`, sai thì "Biên có nguy cơ không được lớn hơn độ chính xác tối thiểu.";
  - thành công: MSG-01 "Lưu cấu hình chấm điểm thành công.".
- Chỉ System Admin; vai trò khác nhận 403.
- `GradingSettingsService.getGradingSettings()` được dùng chung (3a, 3b, 4). Thiếu dòng nào thì báo lỗi 500, **không** có giá trị dự phòng hardcode (A4).

### 4.2 Bài tập (giảng viên sở hữu lớp; lớp của người khác → 404; lớp đã kết thúc → 409 MSG-08)
- **Tạo** `POST /assignments` `{ classId, title, description?, kind, pieceId?, requiredBpm?, publish: boolean }`:
  - tạo version 1;
  - `publish=true` → PUBLISHED, `published_at`, rồi thông báo cho mọi thành viên đang trong lớp;
  - `publish=false` → DRAFT.
- **Kiểm tra dữ liệu:**
  - tiêu đề trim 1–200 (MSG-35 / MSG-37);
  - mô tả ≤ 1000 (MSG-37);
  - `kind` thuộc 4 giá trị;
  - `requiredBpm` nguyên 1–300 (MSG-03 "BPM yêu cầu phải nằm trong khoảng từ 1 đến 300.");
  - `pieceId` phải tồn tại, đang hiển thị, cùng nhạc cụ với lớp, nếu không thì MSG-48 "Bài nhạc đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác." (field `pieceId`).
- **Sửa** `PUT /assignments/:id` (cùng trường, không có `classId` và `publish`): tạo version n+1 và trỏ `current_version_id` sang đó. Áp dụng cho DRAFT, PUBLISHED, CLOSED (A16). Nếu PUBLISHED thì thông báo "đã cập nhật" cho các thành viên.
- **Đăng** `POST /assignments/:id/publish`: chỉ từ DRAFT, nếu không → 409. Thông báo như khi tạo.
- **Đóng** `POST /:id/close`: PUBLISHED → CLOSED. **Mở lại** `POST /:id/reopen`: CLOSED → PUBLISHED. Sai trạng thái → 409.
- **Xóa** `DELETE /assignments/:id`: đặt `deleted_at`. Bài đã xóa trả 404 ở mọi API và không xuất hiện trong danh sách.
- **Kết thúc lớp** (`ClassService.endClass`): trong cùng transaction, chuyển mọi bài PUBLISHED của lớp sang CLOSED (A17).
- **Thông báo:**
  - tiêu đề "Bài tập mới" / "Bài tập đã được cập nhật";
  - nội dung `<tên lớp> · <tiêu đề>`;
  - link `/student/assignments/<id>` (trang của dự án con 3b);
  - người nhận: sinh viên có membership đang hoạt động.
- **Audit:** tạo, đăng, sửa, đóng, mở lại, xóa bài (dùng `AuditLogger`).

### 4.3 Danh sách và chi tiết
- `GET /assignments?classId&kind&status&q` (q ≤ 100, tìm theo tiêu đề): bài của các lớp mình sở hữu, không gồm bài đã xóa.
  - Mỗi bài: `{ id, classId, className, status, version, title, kind, submittedCount, memberCount, updatedAt }`.
  - `submittedCount` = số thành viên đang trong lớp có ≥ 1 bài nộp được đếm.
- `GET /assignments/:id` → phiên bản hiện tại (tiêu đề, mô tả, loại, bài nhạc `{id, title, defaultBpm, isAvailable}`, BPM yêu cầu, BPM hiệu lực), trạng thái, các mốc thời gian, `students[]`.
- `students[]`: mọi thành viên đang trong lớp, kèm `{ studentId, fullName, studentCode, status, submissionCount, lastSubmittedAt, bestAccuracy }`.
- **Bài nộp được đếm** = status ≠ REJECTED và ≠ FAILED (GBR-13). **Trạng thái sinh viên** (hàm thuần `AssignmentProgressCalculator`):
  - **Đạt**: có bài nộp COMPLETED với `accuracy ≥ minAccuracy`;
  - **Đã nộp**: có ≥ 1 bài nộp được đếm;
  - **Chưa nộp**: còn lại.
- `GET /assignments/:id/students/:studentId/submissions`: mọi bài nộp của sinh viên đó cho bài này (kể cả bị từ chối hoặc lỗi), mới nhất trước.
  - Mỗi bài nộp: `{ id, attemptNumber, version, status, accuracy, tempoDeviation, audioUrl, submittedAt, comment: { content, updatedAt } | null }`.
  - Kèm `canComment` = lớp đang hoạt động **và** sinh viên còn trong lớp (A17, A18).
  - Sinh viên không thuộc lớp và chưa từng nộp → 404.

### 4.4 Nhận xét — `PUT /submissions/:id/comment` `{ content }`
- Chỉ giảng viên sở hữu lớp của bài nộp. Nội dung trim 1–2000 (MSG-35 / MSG-37).
- Bị khóa khi `canComment = false` → 409 "Không thể nhận xét vì lớp đã kết thúc hoặc sinh viên không còn trong lớp."
- Lần đầu: tạo nhận xét, thông báo cho sinh viên ("Giảng viên đã nhận xét bài nộp", link `/student/assignments/<assignmentId>`), MSG-01 "Gửi nhận xét thành công.".
- Lần sau: ghi đè, không thông báo, MSG-01 "Cập nhật nhận xét thành công.".

### 4.5 `canSubmit` cho M01
`SubmissionPolicyService.canSubmit(studentId, assignmentId): Promise<{ allowed: boolean; reason: string | null }>` trả `allowed = true` khi đủ cả 4 điều kiện:
- bài **PUBLISHED**;
- bài chưa bị xóa;
- lớp **ACTIVE**;
- sinh viên có membership đang hoạt động.

Không đủ thì `reason` = "Không thể nộp bài vì bài tập đã đóng hoặc không còn khả dụng.". Chưa có endpoint; 3b/M01 sẽ dùng hàm này.

### 4.6 Thay đổi kèm theo
- `GET /classes/:id/roadmap`: bỏ trường `assignments` ở mỗi tuần (bài tập không còn gắn tuần lộ trình). Cập nhật type và tài liệu.

## 5. FE (mobile-first cho giảng viên; trang Admin là desktop)

- **`MobileAppShell`:** bật mục "Bài tập" → `/teacher/assignments`.
- **Danh sách** `/teacher/assignments`:
  - tiêu đề "Bài tập";
  - bộ lọc dạng chip: Lớp (các lớp của mình), Loại, Trạng thái (Nháp / Đã đăng / Đã đóng); ô tìm "Tìm bài tập";
  - thẻ bài: tiêu đề, nhãn loại, tên lớp, trạng thái, "x/n đã nộp";
  - nút "Tạo bài tập";
  - rỗng: "Bạn chưa có bài tập nào."; lọc không ra: "Không tìm thấy bài tập phù hợp.".
- **Tab "Bài tập"** trong Chi tiết lớp: cùng danh sách, cố định theo lớp đó, nút "Tạo bài tập" mở form có sẵn lớp. Ẩn nút khi lớp đã kết thúc.
- **Form** `/teacher/assignments/new?classId=` và `/teacher/assignments/:id/edit`:
  - trường: Lớp * (chỉ lớp đang hoạt động; khóa khi sửa), Tiêu đề * (n/200), Loại *, Mô tả (n/1000), Bài nhạc ("Không chọn" + bài của nhạc cụ lớp), BPM yêu cầu (ô gợi ý "Mặc định: <bpm>");
  - nút khi tạo: Hủy / Lưu nháp / Lưu & Giao Bài; khi sửa: Hủy / Lưu;
  - lỗi từ server hiện dưới đúng trường; giữ dữ liệu đã nhập.
- **Chi tiết** `/teacher/assignments/:id`:
  - tiêu đề, nhãn loại, trạng thái, lớp, "Phiên bản vN", bài nhạc (kèm "Không còn khả dụng" nếu đã ẩn), BPM hiệu lực, mô tả;
  - nút theo trạng thái:
    - Nháp: Sửa / Đăng / Xóa;
    - Đã đăng: Sửa / Đóng / Xóa;
    - Đã đóng: Sửa / Mở lại / Xóa;
    - lớp đã kết thúc: không có nút;
  - popup MSG-02:
    - Đóng: "Đóng bài tập <tiêu đề>? Sinh viên sẽ không thể nộp bài nữa.";
    - Xóa: "Xóa bài tập <tiêu đề>? Bài tập sẽ bị ẩn với cả lớp.";
  - danh sách sinh viên: tên, mã, trạng thái (Chưa nộp / Đã nộp / Đạt), "n lần nộp · gần nhất dd/mm HH:mm · cao nhất x%".
- **Bài nộp của sinh viên** `/teacher/assignments/:id/students/:studentId`:
  - thẻ từng lần nộp: "Lần nộp n · dd/mm/yyyy HH:mm · phiên bản vN", trạng thái (Đang xử lý / Hoàn tất / Từ chối / Lỗi xử lý), độ chính xác, lệch tempo;
  - `<audio controls>` để nghe lại;
  - ô "Nhận xét" (n/2000) + nút "Gửi nhận xét" / "Cập nhật nhận xét". Khi `canComment = false`, ô chỉ đọc và hiện câu giải thích.
- **Admin** `/admin/grading-settings` (`AdminShell`, thêm mục "Cấu hình chấm điểm" vào menu admin):
  - 2 ô số + dòng giải thích theo giá trị đang nhập: "≥ 70 %: Đúng tiến độ · 30–69 %: Có nguy cơ · < 30 %: Chậm tiến độ";
  - nút Lưu.

## 6. Kiểm thử
- **BE unit:**
  - `AssignmentProgressCalculator`: Chưa nộp / Đã nộp / Đạt, bỏ qua bài nộp REJECTED / FAILED, biên đúng bằng `minAccuracy`;
  - `AssignmentValidator` / Zod: tiêu đề, mô tả, BPM 1–300, loại;
  - cấu hình: biên ≤ ngưỡng;
  - `canSubmit` với từng nhánh.
- **BE tích hợp:**
  - tạo nháp / tạo và đăng (có thông báo);
  - sửa → v2, bài nộp vẫn trỏ v1;
  - đóng / mở lại / 409 khi sai trạng thái;
  - xóa mềm → 404 và mất khỏi danh sách;
  - kết thúc lớp → bài đang đăng chuyển sang đã đóng;
  - danh sách + `submittedCount`; chi tiết + trạng thái sinh viên;
  - bài nộp của sinh viên; nhận xét lần đầu (có thông báo), lần sau (không);
  - khóa nhận xét (lớp đã kết thúc, sinh viên đã bị xóa);
  - quyền: giảng viên khác → 404, sinh viên → 403;
  - cấu hình Admin.
- Coverage của `assignments` + `settings` ≥ 70 %.
- **FE:** form (bắt buộc nhập, BPM, mô tả, lỗi server dưới trường), chi tiết (nút theo trạng thái), màn bài nộp (gửi / cập nhật / khóa), trang cấu hình (biên > ngưỡng).
- **Thủ công:** 360 px và desktop cho giảng viên; 1440 px cho Admin.

## 7. Seed
- Lớp TRD301:
  - 1 bài mỗi loại (SOLO đã đăng, ENSEMBLE đã đăng, BONUS đã đóng, OTHER nháp) và 1 bài đã xóa;
  - bài nộp của ~10 sinh viên, độ chính xác từ 20 % đến 95 %, có bài bị từ chối hoặc lỗi;
  - vài bài đã có nhận xét.
- File âm thanh mẫu ngắn tại FE `public/samples/bvc-sample.wav`; seed trỏ `audio_url = /samples/bvc-sample.wav`.

## 8. Ghi vào Q&A sheet
Các mục A1–A18. Đáng chú ý: bỏ rubric và chấm điểm (FR-M03.03.03, UC-13), bỏ hạn nộp và số lần nộp, nhận xét theo từng bài nộp không lưu lịch sử, lớp kết thúc thì đóng bài.

# M03 · Dự án con 2 — Lộ trình 6 tuần (FR-M03.02.01)

Ngày: 15/10/2026 · Nguồn: `M03_Class_Management_Implementation_Prompt.md` §3, §4.4, §6, §7, §11 #1–3 · Phụ thuộc: dự án con 1 (`feature/m03-classes-members`).

## 1. Mục tiêu

- System Admin quản lý **lộ trình 6 tuần theo nhạc cụ**, có **phiên bản bất biến**.
- Lớp được gắn (pin) một phiên bản lộ trình.
- Giảng viên xem lộ trình của lớp ở tab "Lộ trình" (chỉ đọc).

Theo UC-11. Không làm mô hình cũ "giảng viên sửa nội dung tuần / sao chép từ lớp khác" (§11 #1).

Ngoài phạm vi:
- FR-M03.02.02 (tùy chọn).
- Màn xem lộ trình cho sinh viên (quyết định ở dự án con 3; API đã hỗ trợ).
- Danh sách bài tập theo tuần và link "Tạo bài luyện ngón bổ sung" (dự án con 3).

## 2. Quyết định đã thống nhất với người dùng (15/10/2026)

| # | Câu hỏi | Quyết định |
|---|---|---|
| Q1 | Bài luyện ngón lấy từ đâu khi chưa có M02 | Tạo bảng `pieces` tối thiểu (`TODO(M02)`) và seed bài luyện ngón mẫu |
| Q2 | Màn Admin mobile-first? | Không. Màn desktop theo layout `UI/Giám sát hệ thống-html` |
| Q3 | Mỗi tuần có "Mục tiêu học tập" riêng? | Không. Chỉ có **Tiêu đề** (≤ 100) và **Nội dung học tập** (≤ 1.000) |
| Q4 | Lớp tạo khi nhạc cụ chưa có lộ trình | **Gắn bù**: khi lưu phiên bản đầu tiên của nhạc cụ, gắn vào các lớp **đang hoạt động** của nhạc cụ đó chưa có lộ trình |
| Q5 | Sinh viên xem lộ trình ở đâu | Bây giờ chỉ làm màn giảng viên. API cho sinh viên đang là thành viên gọi được |
| D1 | Bài được chọn | Chỉ `kind = FINGER_EXERCISE`, **cùng nhạc cụ** với lộ trình, `is_visible = true` |
| D2 | Trùng bài | Trong **một tuần** không được chọn trùng; giữa các tuần thì được |
| D3 | Khung chuẩn (tiếng Việt) | Xem §4.3 |
| Q6 | Lớp đổi nhạc cụ trước ngày bắt đầu | **Gắn lại** phiên bản mới nhất của nhạc cụ mới (hoặc để trống rồi gắn bù) |

## 3. Dữ liệu (Prisma + migration `m03_roadmaps`)

```text
pieces                      -- TODO(M02): thư viện bài nhạc tối thiểu
  id, title varchar(200), instrument_id FK, kind enum(FINGER_EXERCISE, SONG),
  default_bpm int NULL, is_visible bool default true, created_by FK users NULL, created_at
  index (instrument_id, kind, is_visible)

roadmaps                    -- một dòng = một phiên bản bất biến
  id, instrument_id FK, version int, created_by FK users, created_at
  UNIQUE (instrument_id, version)

roadmap_weeks
  id, roadmap_id FK, week_number smallint CHECK (1..6), title varchar(100), content varchar(1000)
  UNIQUE (roadmap_id, week_number)

roadmap_week_exercises
  id, roadmap_week_id FK, piece_id FK, sort_order int
  UNIQUE (roadmap_week_id, sort_order), UNIQUE (roadmap_week_id, piece_id)   -- D2

classes.roadmap_id FK roadmaps NULL                                          -- phiên bản đã gắn
```

- Có `down.sql`.
- CHECK `week_number` và hai UNIQUE trên `roadmap_week_exercises` viết bằng SQL tay trong migration (Prisma không biểu diễn CHECK).
- Không sửa hoặc xóa dòng của `roadmaps`, `roadmap_weeks`, `roadmap_week_exercises` sau khi tạo.

## 4. Quy tắc nghiệp vụ (BE)

### 4.1 Lưu phiên bản (`POST /admin/roadmaps/:instrumentId/versions`)

Body: `{ weeks: [{ weekNumber, title, content, exerciseIds: string[] }] }`.

1. Nhạc cụ phải tồn tại và đang hoạt động, nếu không → 404.
2. Kiểm tra (gom **tất cả** lỗi, trả 400 kèm `errors[]` với `field = weeks.<k>.<title|content|exerciseIds>`):
   - đúng 6 tuần, `weekNumber` 1..6 không trùng;
   - tiêu đề và nội dung sau khi trim không trống → MSG-35 ("Tiêu đề tuần k không được để trống." / "Nội dung học tập tuần k không được để trống."), không quá 100 / 1.000 ký tự → MSG-37;
   - `exerciseIds` không trùng trong tuần;
   - mỗi bài phải tồn tại, là `FINGER_EXERCISE`, cùng nhạc cụ và `is_visible`, nếu không → MSG-48 "Bài luyện ngón đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác." gắn vào tuần đó;
   - giới hạn kỹ thuật: tối đa 50 bài mỗi tuần (chống payload bất thường).
3. Trong 1 transaction:
   - `version = max(version) + 1`;
   - insert roadmap, 6 tuần và các bài luyện ngón theo thứ tự gửi lên;
   - **gắn bù**: `UPDATE classes SET roadmap_id = <mới> WHERE instrument_id = X AND roadmap_id IS NULL AND status = 'ACTIVE'`.
   - Hai Admin lưu cùng lúc → UNIQUE `(instrument_id, version)` chặn → 409 "Không thể lưu lộ trình vì vừa có phiên bản mới. Vui lòng tải lại."
4. Trả về phiên bản mới, message MSG-01 "Lưu lộ trình thành công."
5. Lớp đã gắn phiên bản cũ **giữ nguyên**.

### 4.2 Tạo lớp

`ClassService.createClass` gắn `roadmap_id` = phiên bản mới nhất của nhạc cụ (nếu có), thay cho `TODO(M03-roadmap)`.

Sửa nhạc cụ của lớp **chưa bắt đầu** (GBR-36 cho phép), theo Q6 = **gắn lại**: `ClassService.updateClass` đặt `roadmap_id` = phiên bản mới nhất của nhạc cụ mới, hoặc `NULL` nếu nhạc cụ mới chưa có lộ trình (khi đó lớp sẽ được gắn bù theo §4.1).

### 4.3 Khung chuẩn (khi nhạc cụ chưa có phiên bản nào)

`GET /admin/roadmaps/:instrumentId` trả về `{ version: null, isTemplate: true, weeks }`. Nội dung để trống, không có bài luyện ngón. **Chưa ghi DB** cho tới khi Admin lưu.

| Tuần | Tiêu đề |
|---|---|
| 1 | Làm quen nhạc cụ & kỹ thuật cơ bản |
| 2 | Bài tập kỹ thuật & Bài 1 |
| 3 | Bài 1, kiểm tra cá nhân & trình bày nhóm |
| 4 | Hoàn thiện kỹ thuật & chuẩn bị hòa tấu |
| 5 | Ghép nhóm hòa tấu |
| 6 | Biểu diễn cuối khóa (Final Performance) |

### 4.4 Xem lộ trình của lớp (`GET /classes/:id/roadmap`)

- Quyền:
  - giảng viên **sở hữu** lớp;
  - hoặc sinh viên có membership **đang hoạt động** (`removed_at IS NULL`).
  - Còn lại → 404, không lộ sự tồn tại của lớp.
- Lớp chưa có lộ trình → `{ roadmap: null }`.
- Mỗi tuần k (hàm thuần `RoadmapWeekCalculator`, tính theo ngày UTC+7):
  - `startDate = classStart + 7(k−1)`, `endDate = classStart + 7k − 1`;
  - `status`: `PAST` nếu hôm nay > endDate; `CURRENT` nếu startDate ≤ hôm nay ≤ endDate; `UPCOMING` nếu hôm nay < startDate;
  - `exercises: [{ pieceId, title, isAvailable }]` theo `sort_order`. `isAvailable = is_visible` hiện tại; bài đã ẩn **vẫn hiện** kèm ghi chú;
  - `assignments: []` (dự án con 3 điền).

### 4.5 API

| Method | Path | Quyền | Trả về |
|---|---|---|---|
| GET | `/admin/roadmaps` | Admin | `[{ instrument: {id,name}, latestVersion: null \| { version, createdAt } }]`, chỉ nhạc cụ đang hoạt động |
| GET | `/admin/roadmaps/:instrumentId` | Admin | Phiên bản mới nhất (tuần + bài kèm `isAvailable`) hoặc khung chuẩn |
| GET | `/admin/roadmaps/:instrumentId/exercises?q=` | Admin | Bài luyện ngón khả dụng của nhạc cụ (tìm theo tên, ≤ 100 ký tự) |
| POST | `/admin/roadmaps/:instrumentId/versions` | Admin | 201, phiên bản mới |
| GET | `/classes/:id/roadmap` | GV sở hữu / SV trong lớp | §4.4 |

- Giảng viên hoặc sinh viên gọi `/admin/*` → 403.
- Module BE mới: `src/modules/roadmaps/` (đủ các tầng theo convention).
- Bảng `pieces` được truy vấn qua repository của module này. Khi M02 làm thư viện thật thì chuyển sang module `music-library`.

## 5. FE

### 5.1 Admin "Quản Lý Lộ Trình" — `/admin/roadmaps` (desktop, chỉ `SYSTEM_ADMIN`)

Layout theo `UI/Giám sát hệ thống-html`:
- Component dùng chung mới `AdminShell`:
  - sidebar 236 px nền `bvc-soft`, logo chữ "Bách Việt Cầm" + chuông thông báo;
  - nav dạng pill, mục đang chọn nền `bvc-ink` chữ trắng;
  - thẻ người dùng ở đáy;
  - vùng main có padding 26/32, tiêu đề H1 32px/800 + dòng phụ.
- Nav của `AdminShell`: Tổng quan (`/admin`), Người dùng (`/admin/users`), Nội dung & danh mục (`/admin/categories`), **Lộ trình học tập** (`/admin/roadmaps`), Thông báo (`/admin/notifications`), Giám sát hệ thống (`/admin/monitoring`), Cấu hình (`/admin/config`).
- Chỉ trang mới dùng `AdminShell`; **không sửa** các trang admin mockup khác.
- Bố cục main: grid 2 cột.
  - **Trái** (section "Nhạc cụ"): danh sách nhạc cụ dạng hàng. Mỗi hàng có tên, "Chưa có lộ trình" hoặc "Phiên bản vN · dd/mm/yyyy", và chấm trạng thái. Hàng đang chọn được tô nền.
  - **Phải** (trình soạn):
    - Đầu trình soạn: tên nhạc cụ, "Phiên bản hiện tại vN" hoặc "Chưa có lộ trình · khởi tạo từ khung chuẩn", ghi chú "Lưu sẽ tạo phiên bản mới. Lớp đang dùng phiên bản cũ giữ nguyên."
    - 6 section tuần, mỗi section có:
      - Tiêu đề (bộ đếm n/100);
      - Nội dung học tập (textarea, bộ đếm n/1000);
      - danh sách bài luyện ngón: tên, nút ↑ ↓ và Xóa. Bài `isAvailable = false` có nhãn cảnh báo "Không còn khả dụng" (MSG-48);
      - nút "Thêm bài luyện ngón" mở dialog: ô tìm kiếm, danh sách checkbox nhiều bài (ẩn bài đã có trong tuần), nút "Thêm".
    - Lỗi từ server hiện ngay dưới trường hoặc trong section tuần tương ứng.
    - Chân trang dính đáy:
      - "Hủy" → quay về dữ liệu đã tải;
      - "Lưu" → toast MSG-01, tải lại danh sách và phiên bản;
      - lỗi 5xx → toast MSG-09 "Lưu lộ trình thất bại. Vui lòng thử lại.", giữ nguyên dữ liệu đang nhập.
    - Đổi nhạc cụ hoặc rời trang → bỏ thay đổi, không hỏi (đúng §4.4 prompt).

### 5.2 Tab "Lộ trình" trong Chi tiết lớp (giảng viên, mobile-first)

Thay chữ "Chức năng đang phát triển." của tab `roadmap`:
- Dòng "Lộ trình · Phiên bản vN".
- 6 thẻ tuần, style thẻ giống `MemberCard`. Thẻ "Tuần này" có viền `bvc-ink`. Mỗi thẻ có:
  - "Tuần k · <tiêu đề>";
  - ngày `dd/mm – dd/mm/yyyy` (font mono);
  - nhãn trạng thái Đã qua / Tuần này / Sắp tới;
  - nội dung (giữ xuống dòng);
  - mục "Bài luyện ngón": danh sách tên, bài không khả dụng thì kèm chữ "Không còn khả dụng".
- Lớp chưa có lộ trình: "Lớp chưa có lộ trình. Lộ trình sẽ được gắn khi quản trị viên tạo lộ trình cho nhạc cụ này."
- Có loading, lỗi tải (MSG-09 + "Thử lại").

## 6. Kiểm thử

- **BE unit:**
  - `RoadmapWeekCalculator`: ngày tuần 1/6, trạng thái, biên 00:00 UTC+7, lớp chưa bắt đầu (toàn Sắp tới), lớp đã kết thúc (toàn Đã qua);
  - `RoadmapValidator`: 6 tuần, MSG-35/37 theo tuần, trùng bài, MSG-48 (sai loại / khác nhạc cụ / đã ẩn / không tồn tại);
  - khung chuẩn.
- **BE tích hợp:**
  - lưu v1 rồi v2;
  - lớp tạo trước giữ v1, lớp tạo sau nhận v2;
  - gắn bù chỉ cho lớp ACTIVE chưa có lộ trình;
  - đổi nhạc cụ trước khi bắt đầu → gắn lại (Q6), nhạc cụ mới chưa có lộ trình → `NULL`;
  - API admin: GV/SV → 403;
  - `/classes/:id/roadmap`: chủ lớp, SV trong lớp, SV đã bị xóa (404), GV khác (404), lớp chưa có lộ trình (`roadmap: null`).
- Coverage module `roadmaps` ≥ 70 %.
- **FE:** util tuần (ngày, trạng thái); trình soạn admin (lỗi theo tuần, ↑ ↓, thêm/xóa bài, Hủy khôi phục); tab lộ trình (không có lộ trình, có lộ trình).
- **Thủ công:** màn admin ở 1440 px; tab lộ trình ở 360 px và desktop.

## 7. Seed

- Mỗi nhạc cụ có 3 bài `FINGER_EXERCISE` + 1 bài `SONG`, cùng 1 bài luyện ngón ẩn (để thử "Không còn khả dụng").
- Đàn tranh và Đàn bầu có lộ trình v1.
- Seed idempotent; các lớp seed đang hoạt động được gắn theo quy tắc.

## 8. Ghi vào Q&A sheet

- Q3 (§3 nói có "learning objective" nhưng màn hình không có).
- Q4 (lớp tạo khi nhạc cụ chưa có lộ trình).
- D1/D2.
- Q6 (đổi nhạc cụ trước ngày bắt đầu → gắn lại lộ trình của nhạc cụ mới).

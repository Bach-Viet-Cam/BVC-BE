# M03 · Dự án con 4 — Theo dõi tiến độ sinh viên (FR-M03.02.03)

Ngày: 16/10/2026 · Nhánh: `feature/m03-classes-members` (BE + FE) · Phụ thuộc: dự án con 1 (lớp, thành viên), 2 (lộ trình), 3a (bài tập, bài nộp, cấu hình chấm điểm).

## 1. Mục tiêu và phạm vi

Giảng viên thấy **ai đang yếu**:
- mỗi sinh viên có trạng thái tiến độ, tính từ độ chính xác AI so với ngưỡng Admin cấu hình;
- trang của từng sinh viên có tóm tắt luyện tập, biểu đồ độ chính xác theo tuần và lịch sử bài nộp.

Không có bảng mới; mọi số liệu tính lúc đọc.

FR-M03.01.05 (đánh giá / nhận xét) đã được thay bằng nhận xét theo từng bài nộp ở 3a.

Ngoài phạm vi:
- màn tiến độ cho sinh viên (làm cùng 3b); API đã hỗ trợ;
- loại hoạt động "Chế độ luyện" (M01) và "Hòa tấu" (M05);
- M01 analysis screen.

## 2. Quyết định của người dùng (16/10/2026)

| # | Nội dung | Quyết định |
|---|---|---|
| P1 | Bài tính vào tiến độ | Bài **Đã đăng** hoặc **Đã đóng**, chưa xóa, loại (phiên bản hiện tại) **khác Bonus** |
| P2 | Lịch sử luyện tập | Chỉ **Bài nộp** |
| P3 | Biểu đồ theo tuần | Xếp theo **tuần của lớp tính từ ngày nộp** (giờ Việt Nam). Bài nộp trước tuần 1 hoặc sau tuần 6 **không** đưa vào biểu đồ, nhưng vẫn có trong lịch sử |
| P4 | Điểm của tuần k | Trung bình độ chính xác của **mọi** bài nộp Hoàn tất trong tuần, thuộc bài tính tiến độ (P1). Tuần không có dữ liệu → `null` |
| P5 | Tóm tắt | "Tổng buổi luyện" = mọi lần nộp trong lớp, gồm cả bị Từ chối / Lỗi xử lý và cả Bonus, trừ bài đã xóa. "Buổi trong 7 ngày qua" = số lần nộp như trên trong 7 × 24 giờ gần nhất |
| P6 | Sinh viên xem tiến độ của mình | Bây giờ chỉ có API; màn hình làm ở 3b |
| P7 | Đường vào | Tab "Tiến độ" trong lớp; mục "Đánh giá" trên thanh điều hướng đổi thành **"Tiến độ"** → `/teacher/progress` (chọn lớp, mặc định lớp mở gần nhất); nút **"Xem tiến độ"** trong danh sách thành viên; tên sinh viên ở màn Tiến độ → trang sinh viên; "Xem" ở lịch sử → trang bài nộp của 3a |

Quy tắc kế thừa từ prompt §4.5 (GBR-02, GBR-24) và 3a:
- mỗi bài lấy lần nộp **Hoàn tất có độ chính xác cao nhất**; `average` = trung bình trên các bài có ít nhất 1 lần như vậy;
- ngưỡng `minAccuracy` và `atRiskMargin` lấy từ `system_settings`:
  - `avg ≥ min` → Đúng tiến độ;
  - `min − margin ≤ avg < min` → Có nguy cơ;
  - `avg < min − margin` → Chậm tiến độ;
  - không có dữ liệu → "-".

## 3. BE

### 3.1 Logic thuần — `src/modules/progress/service/ProgressCalculator.ts`
- `averageOfBest(submissions: Array<{ assignmentId; status; accuracy: number | null }>): number | null`: chỉ tính bài nộp COMPLETED có `accuracy`; mỗi bài lấy giá trị lớn nhất; trả trung bình làm tròn 2 chữ số thập phân.
- `resolveStatus(average: number | null, settings: { minAccuracy; atRiskMargin }): 'ON_TRACK' | 'AT_RISK' | 'BEHIND' | null`.
- `weekOf(classStartDate: string, submittedAt: Date): number | null`: tuần 1–6 theo ngày nộp ở giờ Việt Nam; ngoài khoảng thì trả `null`.
- `weeklyAverages(classStartDate, submissions: Array<{ status; accuracy; submittedAt }>): Array<{ week; startDate; endDate; average: number | null }>`: đủ 6 phần tử.

### 3.2 API (module mới `src/modules/progress`, route gắn dưới `/classes`)

Quyền:
- giảng viên **sở hữu lớp**;
- hoặc **sinh viên** chỉ với chính `studentId` của mình **và** đang là thành viên.

Ngoài hai trường hợp đó → 404; vai trò khác (Admin) → 403.

| Method | Path | Trả về |
|---|---|---|
| GET | `/classes/:id/progress` (chỉ giảng viên) | `{ counts: { ON_TRACK, AT_RISK, BEHIND, NO_DATA }, students: [{ studentId, fullName, studentCode, average, status, assignmentsWithSubmissions, lastSubmittedAt }] }`. Chỉ thành viên đang trong lớp, xếp theo tên |
| GET | `/classes/:id/students/:studentId/summary` | `{ student: { id, fullName, studentCode }, class: { id, name, cohort, instrument: { id, name }, startDate }, average, status, minAccuracy, totalSessions, sessionsLast7Days, weekly[6] }` (`minAccuracy` để vẽ đường ngưỡng) |
| GET | `/classes/:id/students/:studentId/history?from&to&page&limit` | `{ items: [{ submissionId, assignmentId, assignmentTitle, kind, status, accuracy, submittedAt }], pagination }`, mới nhất trước. `from` / `to` dạng `yyyy-MM-dd` (giờ Việt Nam, cả hai đầu đều tính). `from > to` → 400, field `from`, MSG-04 "Từ ngày không được sau đến ngày." |

- Ở `history` và `summary`, giảng viên được xem cả sinh viên **đã bị xóa khỏi lớp** nhưng từng có bài nộp trong lớp (giống trang bài nộp của 3a). Người không có membership và không có bài nộp → 404.
- `history` gồm mọi bài nộp của sinh viên trong lớp, kể cả Bonus và bị từ chối; bỏ bài nộp của bài đã xóa.

## 4. FE (mobile-first, `features/classes`)

- **`ProgressList({ classId })`** dùng chung cho tab "Tiến độ" (thay chữ "Chức năng đang phát triển.") và trang `/teacher/progress`:
  - 4 chip đếm: "Đúng tiến độ n", "Có nguy cơ n", "Chậm tiến độ n", "Chưa có dữ liệu n";
  - lọc "Trạng thái tiến độ": Tất cả trạng thái / Đúng tiến độ / Có nguy cơ / Chậm tiến độ (sinh viên "-" chỉ hiện ở "Tất cả trạng thái");
  - ô tìm "Mã hoặc tên sinh viên" (≤ 100);
  - sắp xếp: ô chọn Tên / Mã sinh viên / Độ chính xác TB / Lần nộp gần nhất, kèm nút "Tăng dần / Giảm dần"; giá trị `null` luôn xếp cuối;
  - mỗi hàng là link tới trang sinh viên: tên, mã, nhãn trạng thái (hoặc "-"), dòng "TB 72.5% · 3 bài · gần nhất 16/10 09:30" (hoặc "Chưa có bài nộp được phân tích");
  - rỗng: "Lớp chưa có sinh viên."; lọc không ra: "Không tìm thấy sinh viên phù hợp.".
- **`/teacher/progress`** (`MobileAppShell`, tiêu đề "Tiến độ"):
  - ô chọn "Lớp" chỉ gồm lớp đang hoạt động;
  - mặc định là lớp mở gần nhất, lấy từ `localStorage` khóa `bvc:lastClassId:<userId>`. Khóa này được ghi khi mở Chi tiết lớp. Không có hoặc không còn hợp lệ thì lấy lớp đầu tiên;
  - giảng viên chưa có lớp đang hoạt động: "Bạn chưa có lớp học nào đang hoạt động.".
- **Trang sinh viên** `/teacher/classes/:classId/students/:studentId`:
  - phần đầu: tên, "mã · lớp · nhạc cụ · khóa";
  - 3 ô số: "Tổng buổi luyện", "Buổi trong 7 ngày qua", "Độ chính xác TB" (kèm nhãn trạng thái);
  - biểu đồ đường "Độ chính xác trung bình theo tuần" W1–W6: trục Y 0–100 %, tuần `null` không có điểm và đứt nét nối, có đường ngưỡng `minAccuracy` (lấy từ phản hồi `summary`);
  - "Lịch sử luyện tập":
    - lọc "Từ" – "đến" dạng dd/mm/yyyy; nếu từ > đến thì **giữ kết quả cũ** và hiện MSG-04;
    - sắp xếp mới nhất / cũ nhất / độ chính xác;
    - mỗi dòng: tên bài, loại, trạng thái, độ chính xác, thời điểm; nút "Xem" → `/teacher/assignments/:assignmentId/students/:studentId`.
- **`MobileAppShell`:** mục "Đánh giá" đổi thành "Tiến độ" → `/teacher/progress`. **`MemberCard`:** hiện nút "Xem tiến độ" → trang sinh viên.

## 5. Kiểm thử
- **BE unit (`ProgressCalculator`):**
  - trung bình của lần tốt nhất mỗi bài; bỏ bài nộp không Hoàn tất;
  - biên đúng bằng `min` (ON_TRACK) và đúng bằng `min − margin` (AT_RISK), `null` → `null`;
  - tuần 1 bắt đầu lúc 00:00 giờ Việt Nam; ngày cuối tuần 6 thuộc W6; ngày sau đó → `null`; trước ngày bắt đầu → `null`.
- **BE tích hợp:**
  - progress: loại Bonus, bài đã xóa, bài nháp; tính bài đã đóng; NO_DATA; chỉ thành viên đang trong lớp; ngưỡng đổi thì trạng thái đổi;
  - summary: tổng buổi gồm bị từ chối và Bonus, trừ bài đã xóa; 7 ngày; weekly;
  - history: lọc ngày, MSG-04, phân trang;
  - quyền: giảng viên khác → 404, sinh viên xem chính mình → 200, sinh viên xem người khác → 404, Admin → 403, sinh viên gọi `/progress` → 403.
- Coverage của `src/modules/progress/**` ≥ 70 %.
- **FE:** `ProgressList` (ô đếm, lọc, tìm, sắp xếp, `null` xếp cuối); biểu đồ (6 tuần, tuần trống); bộ lọc ngày (MSG-04 giữ kết quả cũ); nhớ lớp mở gần nhất.
- **Thủ công:** 360 px và desktop.

## 6. Seed
Dùng seed của 3a. Thêm bài nộp rải trên vài tuần (W1–W4) cho một số sinh viên ở lớp TRD301, để biểu đồ có dữ liệu và đủ cả 3 trạng thái tiến độ.

## 7. Ghi vào Q&A sheet
P1–P7. Còn treo 3 câu từ 3a:
- "n lần nộp" đếm gì;
- bấm Lưu khi không đổi gì có tạo phiên bản mới không;
- có thông báo khi mở lại hoặc xóa bài không.

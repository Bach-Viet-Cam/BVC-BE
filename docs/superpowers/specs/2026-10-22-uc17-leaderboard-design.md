# UC-17 Bảng xếp hạng (FR-M04.05.01, FR-M04.05.02) · Design

> Quyết định, mã thông báo, lỗi SRS và câu hỏi gửi BA. Kế hoạch triển khai: `docs/superpowers/plans/2026-10-22-uc17-leaderboard.md`.

## Context

UC-17 "Xem bảng xếp hạng" là chức năng **Extend** của M04, ngân sách 9 pd (FR-M04.05.01: 5 pd, FR-M04.05.02: 4 pd). Hiện trạng:
- **FE:** `BVC-FE/src/features/community/pages/LeaderboardPage.tsx` chỉ là mock, dữ liệu cứng, chỉ Student vào được (`router.tsx:151`).
- **BE:** chưa có bảng, code tính chuỗi hay xếp hạng nào. `src/modules/community/index.ts` là stub rỗng.

Plan này xây snapshot xếp hạng định kỳ (DBR-14), API đọc từ snapshot (NFR ≤ 2 s / 100 CCU) và màn "Bảng xếp hạng" thật cho Student (mobile-first), Lecturer và Admin (web-first, có layout PWA).

**Goal:** sinh viên, giảng viên và admin xem được "Xếp hạng tổng" và 4 hạng mục của học kỳ hiện tại, tính đến lần làm mới gần nhất.

**Architecture:**
- **BE:** module mới `src/modules/leaderboard`.
  - Hai lớp hàm thuần: `LeaderboardMetricCalculator` (chỉ số) và `LeaderboardRankingCalculator` (chuẩn hoá, điểm tổng, xếp hạng).
  - `LeaderboardSnapshotService` đọc nguồn và ghi snapshot trong một transaction.
  - `LeaderboardScheduler` theo đúng mẫu `NotificationDispatchService` (setInterval + catch-up).
  - API chỉ đọc snapshot.
- **FE:** `features/community` gồm `api`, `hooks`, `components`, `constants` và `types`. Một route cho Student (mobile) và một route cho Lecturer/Admin (DesktopLayout, dùng `useIsMobile` để chuyển sang layout PWA).

**Tech Stack:** Express 5 · Prisma 7 (`db push`, không tạo migration) · Zod 4 · Vitest + supertest (DB thật cổng 5433) · React 19 · Tailwind v4 (`bvc-*`).

---

## Decisions

Đã đối chiếu với codebase. ✅ = codebase hỗ trợ, ⚠️ = cần BA hoặc GVHD xác nhận (đã có fallback nên không chặn code).

| # | Quyết định cuối | Căn cứ trong code |
|---|---|---|
| D1 ✅ (điều chỉnh) | **Học kỳ = phần tử của SystemConfig `class.semesters`** (`{name, startDate, endDate}`, ví dụ `FA26`). `Class.cohort` lưu đúng tên học kỳ. "Hiện tại" = học kỳ có `startDate ≤ hôm nay (UTC+7) ≤ endDate`. Không có học kỳ nào như vậy thì trả rỗng (MSG-49). **Không** dùng nhánh "học kỳ gần nhất" của `pickDefaultSemester`. Nhãn hiển thị: map tiền tố FA→Thu, SP→Xuân, SU→Hè, năm `20yy` (`FA26` → "Học kỳ Thu 2026"); tên lạ thì hiện nguyên tên. | Có sẵn Semester trong config: `SystemConfigService.getSemesters()`, `ClassService.pickDefaultSemester` (`ClassService.ts:41-55`), `PlatformConstant.ts:7-15`. Không cần tự suy từ cohort. |
| D2 ✅ | **Được xét hạng:** `ClassMember.removedAt = null` của mọi lớp có `cohort = semester.name` (gồm ACTIVE và ENDED, mọi nhạc cụ), có `User.role = STUDENT`. Mỗi sinh viên chỉ xếp **một lần**. Cột "lớp" = lớp có nhiều hoạt động nhất trong học kỳ; hoà thì lấy tên lớp theo thứ tự A→Z. | `ClassMember` xoá mềm (`schema.prisma:415-436`). Không có unique (classId, userId), nên phải dedupe. |
| D3 ✅ | **Không có hoạt động** = không có bài nộp nào (mọi trạng thái, trừ bài tập đã xoá) **và** không có `EnsembleSession` (≠ FAILED) trong khoảng ngày của học kỳ. Sinh viên không có hoạt động không được xếp hạng. | Định nghĩa "buổi luyện" P5 của progress (`ProgressRepository.countSessions`). M01 không có bảng phiên luyện riêng, nên nguồn chỉ gồm `submissions` và `ensemble_sessions`. |
| D4 ⚠️ Q2 | Mỗi tiêu chí được chuẩn hoá min-max về 0–100 trên tập được xếp hạng. Nếu mọi người có cùng giá trị thì tất cả được 100. Thiếu giá trị (ví dụ chưa có bài COMPLETED) thì tính 0. **Điểm tổng** = trung bình các tiêu chí đang bật, làm tròn 1 chữ số. Danh sách tiêu chí là hằng số `LeaderboardConstant.overallCriteria`, nên bỏ một tiêu chí chỉ cần sửa 1 dòng. | Hàm thuần, test theo bảng. |
| D5 ✅ (điều chỉnh) | **Độ chính xác** = `ProgressCalculator.averageOfBest`: lấy accuracy cao nhất của các bài COMPLETED trên mỗi bài tập được tính (PUBLISHED/CLOSED, chưa xoá, không phải BONUS), rồi lấy trung bình trên mọi lớp của học kỳ. Dùng chung cho tiêu chí tổng và tab "Chính xác nhất". Với SV chỉ học một lớp, số này khớp số trên màn Tiến độ. | `ProgressCalculator.ts:12-19`, `ProgressRepository.ts:5-8`. Đây là thay đổi so với đề xuất "trung bình mọi bài nộp": không còn dữ liệu `analysis_results`, accuracy nằm ở `Submission.accuracy`. |
| D6 ⚠️ Q3 | Một **ngày luyện** (theo lịch UTC+7) là ngày có ≥ N hoạt động theo D3. N = `LeaderboardConstant.streakMinActivitiesPerDay = 1`. **Tiêu chí tổng** = chuỗi dài nhất trong học kỳ. **Tab "Chuỗi luyện tập"** = chuỗi hiện tại, kết thúc hôm nay hoặc hôm qua. | "Quy tắc luyện tập" hiện chỉ có `class.semesters`. `practice_min_per_week` được validate nhưng chưa seed và chưa đọc ở đâu. **Chưa thêm key mới** cho tới khi Q3 có câu trả lời. |
| D7 ✅ | **Tích cực nhất** = số bài nộp (theo D3) + số phiên ensemble (≠ FAILED) trong tuần ISO hiện tại (T2 00:00 đến CN 23:59, UTC+7). | Cần helper tuần mới trong `DateTimeUtil`. |
| D8 ⚠️ | **Tiến bộ nhất** = TB accuracy của bài COMPLETED được tính trong tuần này − TB của tuần trước, đơn vị điểm %. Chỉ xét SV có dữ liệu ở **cả hai** tuần. SV thiếu dữ liệu thì `me` hiện MSG-52. Cả tab không có ai thì hiện MSG-52. Hạn chế: snapshot 08:00 thứ Hai gần như chưa có dữ liệu "tuần này", nên đầu tuần tab thường trống. Phương án thay là so 7 ngày gần nhất với 7 ngày liền trước. Cần BA chọn. | Logic giống `ProgressCalculator.weeklyAverages` nhưng chia theo tuần lịch. |
| D9 ✅ (đổi theo yêu cầu 22/10) | **Xếp hạng tuần tự** (1, 2, 3, 4): không đồng hạng, không nhảy cách. Người bằng điểm xếp theo `studentCode` tăng dần (null xếp cuối, sau đó theo `userId`), nên `rank` = `position`. | Hàm thuần `LeaderboardRankingCalculator.rank`. |
| D10 ✅ (điều chỉnh) | Repo không có thư viện cron. Dùng `LeaderboardScheduler` theo mẫu `NotificationDispatchService`: `setInterval` 5 phút, `unref()`, chạy một tick ngay khi khởi động để bù lần bị lỡ, start trong `server.ts`. Mỗi tick kiểm tra: đã qua 08:00 UTC+7 và hôm nay chưa có snapshot thì build. Có thêm `npm run leaderboard:refresh` (giống `audio:cleanup`) và `POST /api/v1/leaderboards/refresh` chỉ cho Admin. Lưu `generatedAt` và giữ lại snapshot cũ. | `NotificationDispatchService.ts`, `server.ts:10`. |
| D11 ✅ (điều chỉnh) | Hai model Prisma `LeaderboardSnapshot` và `LeaderboardEntry` (schema ở Task 1). Idempotent: `@@unique([semester, snapshotDate])`. Chạy lại cùng ngày thì xoá rồi ghi lại bản của ngày đó trong cùng transaction. Log job gồm start, end, kết quả, số dòng, thời gian và lỗi, ghi qua `console.info/error` (giống mẫu dispatch) và lưu vào cột `startedAt` và `durationMs` của snapshot. | CLAUDE.md BE: chỉ sửa `schema.prisma`, **không** tạo file migration. |
| D12 ✅ | Chỉ học kỳ hiện tại, đọc từ snapshot mới nhất của học kỳ đó. API nhận thêm `semester` (tuỳ chọn, là tên học kỳ) để FR-M04.06.03 dùng lại sau. | |
| D13 ⚠️ Q5 | Hiện đúng SRS: họ tên (`User.username`, nơi lưu họ tên khi import) và tên lớp. ProfilePage có toggle mock "Hiện tên tôi trên bảng xếp hạng" (`ProfilePage.tsx:16-17`) nhưng BE chưa có field nào, nên **ngoài phạm vi**. | |
| D14 ✅ | `top3` + `items`. Trang mặc định `limit=50`, nút "Xem thêm" nối thêm trang tiếp. Trả `pagination {page, limit, total}` theo convention. `me` luôn được trả, bất kể đang ở trang nào. | Convention BE §list. |
| D15 ⚠️ Q4 | **Điểm thưởng.** Repo không có review hay bảng điểm thưởng nào. Chỉ có `Assignment.bonusPoints Int?` (`schema.prisma:533`). Fallback: tổng `bonusPoints` của các bài tập kind BONUS mà SV có ≥ 1 bài nộp COMPLETED và chưa bị REJECTED. Hiện coi "GV xác nhận" = "không bị từ chối". Nếu BA chọn bỏ tiêu chí này thì xoá nó khỏi `overallCriteria` (D4). | `AssignmentVersion.kind = BONUS`, `SubmissionStatus.REJECTED`. |
| D16 ✅ | **Hoàn thành bài tập** = số bài tập được tính có trạng thái `PASSED` / tổng số bài tập được tính của các lớp mà SV thuộc về trong học kỳ, đơn vị %. `PASSED` lấy từ `AssignmentProgressCalculator.summarize` với `min_accuracy_default`. | `AssignmentProgressCalculator.ts:10-25`, `GradingSettingsService`. |
| D17 ✅ | **Mã thông báo.** Repo dùng mã số (`MessageConstant` hiện đến MSG-48), nên đề xuất **MSG-49…52** thay cho MSG-L1…L4. Bốn thông báo này chỉ hiển thị ở FE (BE trả trạng thái chứ không trả text). Text đặt trong `LEADERBOARD_MESSAGES` (FE), theo mẫu `LIBRARY_MESSAGES`. | |

**Câu hỏi còn mở (đưa vào Q&A sheet):**
- **Q1:** học kỳ = `class.semesters` và cohort = tên học kỳ. Câu này đã có câu trả lời trong code, chỉ cần BA xác nhận nhãn hiển thị.
- **Q2:** cách chuẩn hoá (D4).
- **Q3:** quy tắc chuỗi luyện tập và key setting (D6).
- **Q4:** điểm thưởng (D15).
- **Q5:** quyền riêng tư (D13).
- **Q6:** cửa sổ so sánh của "Tiến bộ nhất" (D8).

### Lỗi SRS cần báo BA (không sửa bằng code)
1. UC 4.4 dẫn GBR-02/24/25/26/27, nhưng các mã này nói về tiến độ, nộp bài và hiển thị bonus. **Quy tắc xếp hạng chưa được định nghĩa** ở đâu cả.
2. UC 4.4 dẫn MSG-35…38, đó là các thông báo validate và ensemble. Cần mã mới, đề xuất:
   - MSG-49 "Học kỳ này chưa có dữ liệu xếp hạng."
   - MSG-50 "Bạn chưa có hoạt động nào trong học kỳ này nên chưa được xếp hạng."
   - MSG-51 "Hạng mục này chưa có dữ liệu."
   - MSG-52 "Chưa có dữ liệu tuần trước để so sánh tiến bộ."
3. Postcondition của UC 4.4 bị chép từ UC thử thách. Đúng phải là: không thay đổi dữ liệu; SV xem hạng tổng và hạng theo hạng mục tính đến lần làm mới gần nhất.
4. Số UC lệch nhau: WBS ghi UC-17, bảng UC trong SRS ghi #20.
5. Mâu thuẫn về điểm bonus: UC-4.3/GBR-05 nói bài bonus chỉ có accuracy, không có điểm; FR 4.2.1/GBR-27 lại cộng điểm xác nhận. Xem Q4.
6. Repo chưa có M01 practice-session, nên "phiên luyện" chỉ gồm bài nộp và phiên ensemble.

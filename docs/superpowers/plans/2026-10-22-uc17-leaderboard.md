# UC-17 · Bảng xếp hạng (FR-M04.05.01, FR-M04.05.02) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Đích lưu sau khi duyệt:** `BVC-BE/docs/superpowers/plans/2026-10-22-uc17-leaderboard.md` (thư mục plans sẵn có của repo).

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

---

## Global Constraints

- **Nhánh:** `feature/m04-leaderboard` ở cả hai repo. **Không commit.** Không sửa CI/CD. Chỉ dùng DB local cổng 5433. Áp schema lên DB dùng chung là việc **thủ công** của người dùng (`npx prisma db push`).
- **BE theo `.agents/rules/coding-convention.md`:**
  - mỗi file export đúng một class; tên file PascalCase có hậu tố layer; import có đuôi `.ts`;
  - hằng số là `static readonly`;
  - chỉ repository được gọi Prisma;
  - thứ tự route: validate → `requireAuthenticatedUser` → `requireRoles` → controller.
- **Giờ:** mọi cửa sổ ngày và tuần tính theo `Asia/Ho_Chi_Minh` (`DateTimeUtil.businessTimeZone`).
- **Quyền:**
  - chưa đăng nhập → 401;
  - Student, Teacher, Admin xem được (200);
  - `me` chỉ có khi viewer là Student, còn lại `null`;
  - `refresh` chỉ Admin, các role khác → 403.
- **FE theo `docs/RULES.md` và `DESIGN.md`:**
  - dùng token `bvc-*`, không shadow, số dùng font mono;
  - vùng chạm ≥ 44 px, rộng tối thiểu 360 px;
  - giờ hiển thị `HH:mm dd/MM/yyyy`;
  - chỉ dùng dấu `-`, không dùng em dash.
- **Màn Student** mobile-first. **Màn Lecturer/Admin** web-first, dưới 768 px chuyển layout PWA riêng, không hiện layout PWA trên web.

## Review Focus
1. **SV học 2 lớp cùng học kỳ** chỉ có 1 dòng; cột lớp là lớp nhiều hoạt động hơn. *Test: Task 4 `student in two classes is ranked once`.*
2. **Tất cả bằng điểm** → mọi người được 100 và cùng hạng 1. **Chỉ có 1 SV** → hạng 1/1. *Test: Task 3 `all equal`, `single student`.*
3. **Hoạt động lúc 23:59 và 00:00 giờ VN** rơi vào hai ngày khác nhau; chuỗi không bị đứt nếu chuỗi kết thúc hôm qua. *Test: Task 2 `streak day boundary UTC+7`.*
4. **Chạy job hai lần cùng ngày** → vẫn chỉ có 1 snapshot cho ngày đó, snapshot cũ của các ngày trước vẫn còn. *Test: Task 5 `rerun is idempotent`.*
5. **Viewer không có hoạt động** → `me.status = NO_ACTIVITY`, danh sách vẫn hiện đủ. *Test: Task 6.*

---

## Tasks

Ước lượng theo pd (1 pd = 8 h). FR-01 = phần tổng, FR-02 = các hạng mục.

### Task 0: Chuẩn bị (0.25 pd)
- [ ] Tạo nhánh `feature/m04-leaderboard` ở BE và FE. Chạy `npm test` và `npm run test:integration` để có baseline xanh.
- [ ] Copy plan này vào `BVC-BE/docs/superpowers/plans/2026-10-22-uc17-leaderboard.md`.

### Task 1: Schema + helper ngày (0.5 pd · FR-01)
**Files:**
- Modify: `BVC-BE/prisma/schema.prisma`, `BVC-BE/src/utils/DateTimeUtil.ts`
- Test: `BVC-BE/tests/unit/DateTimeUtil.test.ts`

```prisma
enum LeaderboardCategory { OVERALL ACCURACY IMPROVEMENT STREAK ACTIVITY }
model LeaderboardSnapshot {
  id String @id @default(uuid()) @db.Uuid
  semester String @db.VarChar(50)            // = Class.cohort
  periodStart DateTime @map("period_start") @db.Date
  periodEnd DateTime @map("period_end") @db.Date
  weekStart DateTime @map("week_start") @db.Date
  snapshotDate DateTime @map("snapshot_date") @db.Date
  startedAt DateTime @map("started_at")
  generatedAt DateTime @map("generated_at")
  durationMs Int @map("duration_ms")
  entries LeaderboardEntry[]
  @@unique([semester, snapshotDate])
  @@index([semester, generatedAt])
  @@map("leaderboard_snapshots")
}
model LeaderboardEntry {
  id String @id @default(uuid()) @db.Uuid
  snapshotId String @map("snapshot_id") @db.Uuid
  category LeaderboardCategory
  studentId String @map("student_id") @db.Uuid
  classId String @map("class_id") @db.Uuid
  rank Int
  position Int                              // thứ tự hiển thị sau tie-break, dùng để phân trang
  value Float                               // giá trị hiển thị của tab
  criteria Json?                            // OVERALL: {streak, accuracy, bonus, completion} gốc + chuẩn hoá
  snapshot LeaderboardSnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  @@unique([snapshotId, category, studentId])
  @@index([snapshotId, category, position])
  @@map("leaderboard_entries")
}
```
(Kiểu id và FK theo đúng mẫu của các model khác trong schema. Thêm relation tới `User` và `Class` nếu mẫu đang dùng.)

- [ ] **Step 1: Test:**
  - `startOfWeekInVietnam('2026-10-22') === '2026-10-19'`; kiểm tra cả CN và T2;
  - `dayKeyInVietnam(new Date('2026-10-21T17:00:00Z')) === '2026-10-22'`;
  - `diffDays`.
- [ ] Step 2: FAIL → Step 3: cài đặt → Step 4: PASS. Sau đó chạy `npx prisma db push` (DB local) và `npm run typecheck`.

### Task 2: LeaderboardMetricCalculator, hàm thuần (1.0 pd · FR-01 + FR-02)
**Files:**
- Create: `src/modules/leaderboard/service/LeaderboardMetricCalculator.ts`, `src/modules/leaderboard/constant/LeaderboardConstant.ts`, `src/types/LeaderboardTypes.d.ts`
- Test: `tests/unit/LeaderboardMetricCalculator.test.ts`

**Interfaces — Produces:**
- Đầu vào của mỗi SV là `Backend.LeaderboardActivity`:
  - `submissions[] {assignmentId, kind, status, accuracy, submittedAt}`
  - `ensembleSessions[] {status, createdAt}`
  - `assignmentIds[]`
  - `bonusAssignments[] {id, bonusPoints}`
- Các hàm thuần:
  - `accuracy(subs)` → dùng lại `ProgressCalculator.averageOfBest`
  - `weeklyImprovement(subs, weekStart)` → `number | null`
  - `activityDays(acts, minPerDay)` → `string[]`
  - `longestStreak(days)`
  - `currentStreak(days, today)`
  - `weeklyActivity(acts, weekStart)`
  - `confirmedBonus(subs, bonusAssignments)`
  - `completionRate(subs, assignmentIds, minAccuracy)` → dùng lại `AssignmentProgressCalculator.summarize`
  - `hasActivity(acts, window)`

- [ ] **Step 1: Test** theo bảng (table-driven):
  - accuracy loại REJECTED/FAILED và kind BONUS;
  - improvement trả `null` khi thiếu một trong hai tuần;
  - streak: ngày rỗng = 0; chuỗi kết thúc hôm qua vẫn tính là hiện tại; chuỗi kết thúc hôm kia = 0; `streak day boundary UTC+7`;
  - activity: ensemble FAILED không được đếm;
  - bonus: bỏ bài bị REJECTED và bài có `bonusPoints` null;
  - completion: 0 bài → 0%.
- [ ] Step 2–4: FAIL → cài đặt → PASS (`npm run test:integration -- tests/unit/LeaderboardMetricCalculator.test.ts`).

### Task 3: LeaderboardRankingCalculator, hàm thuần (0.75 pd · FR-01)
**Files:**
- Create: `src/modules/leaderboard/service/LeaderboardRankingCalculator.ts`
- Test: `tests/unit/LeaderboardRankingCalculator.test.ts`

**Produces:**
- `normalize(values: (number|null)[])` → 0–100
- `overallScores(rows, criteria)` → làm tròn 1 chữ số
- `rank(rows: {studentId, studentCode, value}[], direction)` → `{rank, position}` theo kiểu thi đấu, tie-break bằng `studentCode`

- [ ] **Step 1: Test:**
  - `all equal`: mọi người 100 điểm và hạng 1;
  - `single student`: hạng 1;
  - giá trị thiếu → 0;
  - `1,2,2,4`;
  - tie-break theo studentCode, null xếp cuối;
  - bỏ một tiêu chí khỏi `criteria` → chia trung bình cho 3;
  - giá trị improvement âm vẫn được xếp hạng.
- [ ] Step 2–4.

### Task 4: Repository nguồn + snapshot (0.75 pd · FR-01)
**Files:**
- Create: `src/modules/leaderboard/repository/LeaderboardSourceRepository.ts`, `src/modules/leaderboard/repository/LeaderboardRepository.ts`
- Test: `tests/integration/leaderboard.repository.test.ts`

**Source** (chỉ đọc, đúng 3–4 query gom theo nhóm, không N+1):
- `findSemesterMembers(semesterName)`: lớp có `cohort = name`, thành viên có `removedAt = null`, role STUDENT; trả `username`, `studentCode`, `classId`, `className`;
- `findSubmissions(studentIds, classIds, from, to)`;
- `findEnsembleSessions(studentIds, from, to)`;
- `findCountedAssignments(classIds)`;
- `findBonusAssignments(classIds)`.

**Snapshot:** `replaceSnapshot(tx, header, entries)` (dùng `createMany`), `findLatest(semester)`, `findPage(snapshotId, category, skip, take)`, `findEntry(snapshotId, category, studentId)`, `countEntries`.

- [ ] **Step 1: Test** dùng factory `TestDatabase`:
  - `student in two classes is ranked once` (gom ở tầng service; tầng repo trả đủ các dòng);
  - thành viên đã bị xoá khỏi lớp không xuất hiện;
  - lớp của học kỳ khác không xuất hiện.
- [ ] Step 2–4.

### Task 5: Snapshot job + scheduler (1.0 pd · FR-01)
**Files:**
- Create: `src/modules/leaderboard/service/LeaderboardSnapshotService.ts`, `src/modules/leaderboard/service/LeaderboardScheduler.ts`
- Modify: `src/server.ts` (start, đặt cạnh `NotificationDispatchService.start()`; stop khi nhận SIGTERM), `package.json` (thêm script `leaderboard:refresh` theo mẫu `audio:cleanup`)
- Test: `tests/integration/leaderboard.snapshot.test.ts`

**Luồng `build(now)`:**
1. Xác định học kỳ hiện tại (D1).
2. Đọc nguồn và gom theo SV.
3. Lọc bỏ SV không có hoạt động (D3).
4. Tính 5 bảng: OVERALL lưu kèm `criteria`; các tab khác chỉ gồm SV có dữ liệu ở tab đó; với tab chuỗi và tab tích cực, đó là SV có giá trị > 0.
5. `$transaction`: xoá snapshot cùng `(semester, snapshotDate)` nếu có, rồi ghi snapshot mới.
6. Log start, end, kết quả, số dòng và `durationMs`.

Không có học kỳ hiện tại, hoặc không ai có hoạt động, thì job vẫn ghi snapshot rỗng để `generatedAt` được cập nhật.

**Scheduler:** `tick()` = nếu `now ≥ 08:00 VN` và chưa có snapshot hôm nay thì `build`; toàn bộ bọc try/catch rồi `console.error`. `LeaderboardConstant.refresh = { hour: 8, intervalMs: 300_000 }`.

- [ ] **Step 1: Test:**
  - `rerun is idempotent`;
  - lỗi giữa transaction thì không để lại dữ liệu dở;
  - snapshot của ngày hôm trước vẫn được giữ;
  - `tick` trước 08:00 không build, sau 08:00 build đúng một lần (truyền `now` vào để test);
  - dữ liệu mẫu gồm 3 SV thì ra đúng hạng và điểm như tính tay.
- [ ] Step 2–4.

### Task 6: Read API + refresh API (1.0 pd · FR-01 + FR-02)
**Files:**
- Create: `src/modules/leaderboard/{validation/LeaderboardValidation.ts, dto/LeaderboardDTO.ts, service/LeaderboardService.ts, controller/LeaderboardController.ts, route/LeaderboardRoute.ts}`
- Modify: `src/routes/index.ts`
- Test: `tests/integration/leaderboard.api.test.ts`

**`GET /api/v1/leaderboards/current?category=overall|accuracy|improvement|streak|activity&page=1&limit=50&semester=`**
- Middleware: `requireAuthenticatedUser`, `requireRoles(STUDENT, TEACHER, SYSTEM_ADMIN)`.
- `data` trả về:
  ```
  { semester: {name, label} | null,
    generatedAt: string | null,
    totalRanked: number,
    categoryTotal: number,
    me: { status: 'RANKED', rank, value }
        | { status: 'NO_ACTIVITY' }
        | { status: 'NOT_IN_CATEGORY', reason: 'NO_DATA' | 'NO_PREVIOUS_WEEK' }
        | null,
    top3: Row[],
    items: Row[],
    pagination: {page, limit, total} }
  ```
- `Row = {rank, studentId, fullName, className, value}`.
- Mọi dữ liệu đọc từ snapshot. `items` là phần sau top3, phân trang theo `position`.

**`POST /api/v1/leaderboards/refresh`:** chỉ Admin. Gọi `LeaderboardSnapshotService.build()`, trả `generatedAt`.

- [ ] **Step 1: Test:**
  - Guest → 401; 3 role → 200; refresh với Teacher/Student → 403;
  - chưa có snapshot → `generatedAt null`, `totalRanked 0`;
  - viewer không có hoạt động → `NO_ACTIVITY`;
  - tab improvement thiếu tuần trước → `NOT_IN_CATEGORY / NO_PREVIOUS_WEEK`;
  - `me` vẫn trả khi viewer nằm ở trang 3;
  - `category` sai → 400;
  - integration job → API: refresh xong thì GET thấy đúng hạng.
- [ ] Step 2–4. Coverage module mới ≥ 70%: `npx vitest run --coverage --coverage.include='src/modules/leaderboard/**'`.

### Task 7: FE dữ liệu + màn Student (1.25 pd · FR-01 + FR-02)
**Files:**
- Create:
  - `features/community/{api/leaderboardApi.ts, types/leaderboardTypes.ts, hooks/useLeaderboard.ts, constants/leaderboardConstants.ts}` (gồm `LEADERBOARD_MESSAGES` MSG-49..52 và nhãn tab: "Xếp hạng tổng", "Chính xác nhất", "Tiến bộ nhất", "Chuỗi luyện tập", "Tích cực nhất"; định dạng giá trị: 1 chữ số, `%`, `+x.x%`, `n ngày`, `n buổi`)
  - `features/community/components/{LeaderboardMetaLine, LeaderboardPodium, LeaderboardRankList, MyRankCard}.tsx`
- Move: `features/classes/hooks/useApiQuery.ts` → `shared/hooks/useApiQuery.ts`, vì giờ hai feature cùng dùng (RULES §2). Cập nhật import trong các hook của classes.
- Rewrite: `features/community/pages/LeaderboardPage.tsx`, bỏ mock và dùng `PillTabs`, `UserAvatar`, `EmptyState`, `Skeleton`, `MobileHeader`.
- Modify: thêm một lối vào cho Student. Đề xuất một thẻ link trên `home/pages/HomePage.tsx` và không thêm tab thứ 5 vào `STUDENT_TABS`.
- Test: `features/community/__tests__/LeaderboardPage.test.tsx` (`vi.mock` api, theo mẫu `ClassListPage.test.tsx`).

**Nội dung màn:**
- dòng "Học kỳ Thu 2026 · Cập nhật 08:00 22/10/2026";
- thẻ "Hạng của bạn": hạng / tổng / giá trị, hoặc MSG-50 / MSG-51 / MSG-52;
- tab;
- podium top 3;
- danh sách, dòng của viewer tô `bg-bvc-accent-tint`;
- "Xem thêm";
- skeleton, trạng thái lỗi kèm nút thử lại, rỗng thì MSG-49.

- [ ] **Step 1: Test:**
  - render tab mặc định là tổng;
  - đổi tab thì gọi API với `category` mới;
  - dòng của viewer được highlight;
  - đủ 4 empty state;
  - "Xem thêm" nối thêm trang;
  - role Teacher không thấy thẻ "Hạng của bạn".
- [ ] Step 2–4. Chạy `npm run lint && npm run typecheck && npm test`.

### Task 8: Màn Lecturer/Admin (0.75 pd · FR-01)
**Files:**
- Modify `router.tsx`:
  - giữ `/community/leaderboard` cho Student;
  - thêm `/leaderboard` trong block Teacher+Admin (`router.tsx:210-214`, DesktopLayout).
- Modify `navConfig.ts`: thêm "Bảng xếp hạng" vào `TEACHER_NAV` và `ADMIN_NAV`.
- Create `features/community/pages/LeaderboardDesktopPage.tsx`:
  - web: `TeacherPageHeader` + bảng (Hạng, Họ tên, Lớp, Giá trị) + podium;
  - dưới 768 px: dùng lại các component mobile của Task 7;
  - không có "Hạng của bạn".
- Test: thêm case Teacher/Admin trong test của Task 7, và test mobile/desktop bằng cách mock `useIsMobile`.
- [ ] Step 1–4.

### Task 9: Kiểm tra cuối + tài liệu (0.5 pd)
- [ ] BE: chạy `npm run lint && npm run typecheck && npm test && npm run test:integration`.
- [ ] Hiệu năng: seed khoảng 300 SV qua script local, chạy `npm run leaderboard:refresh`, rồi `npx autocannon -c 100 -a 2000 -H "Authorization=Bearer <token>" http://localhost:<port>/api/v1/leaderboards/current` để có p95 ≤ 2 s. Không thêm dependency. Ghi kết quả vào `M03-M04_Verification_Plan.md` mục FR-M04.05.
- [ ] FE: chạy `npm run build`. Kiểm tra trên Chrome ở 360 px với Student và ở 1440 px với Lecturer.
- [ ] Docs: thêm vào plan, hoặc vào `BVC-BE/docs/superpowers/specs/2026-10-22-uc17-leaderboard-design.md`, phần Decisions, MSG-49..52, danh sách lỗi SRS và Q1–Q6 để gửi BA.
- [ ] Ghi lại bước thủ công cho người dùng: `npx prisma db push` trên DB dùng chung, rồi gọi refresh lần đầu.

---

## Ước lượng so với WBS

| Task | pd | FR |
|---|---|---|
| 0 Chuẩn bị | 0.25 | - |
| 1 Schema + ngày | 0.5 | 01 |
| 2 Metric | 1.0 | 01/02 |
| 3 Ranking | 0.75 | 01 |
| 4 Repository | 0.75 | 01 |
| 5 Snapshot + scheduler | 1.0 | 01 |
| 6 API | 1.0 | 01/02 |
| 7 FE Student | 1.25 | 01/02 |
| 8 FE Lecturer/Admin | 0.75 | 01 |
| 9 Kiểm tra + docs | 0.5 | - |
| **Tổng** | **7.75 / 9** | dư 1.25 pd cho thay đổi sau khi có trả lời Q2–Q6 |

**Nếu vượt ngân sách, cắt theo thứ tự:**
1. `POST /refresh` (vẫn còn npm script), −0.25;
2. bảng desktop riêng ở Task 8: Lecturer/Admin dùng chung layout mobile căn giữa, −0.5;
3. đo hiệu năng bằng autocannon, chỉ giữ index và review query, −0.25.

## Verification
- **Unit:** `tests/unit/LeaderboardMetricCalculator.test.ts` và `LeaderboardRankingCalculator.test.ts`.
- **Integration (DB 5433):** `leaderboard.repository`, `leaderboard.snapshot` và `leaderboard.api` (job → API, quyền 401/403/200).
- **Coverage:** module leaderboard ≥ 70%.
- **E2E thủ công:**
  1. `npm run db:seed && npm run db:seed:classes`;
  2. tạo vài bài nộp và phiên ensemble;
  3. `npm run leaderboard:refresh`;
  4. mở `/community/leaderboard` bằng Student ở 360 px và `/leaderboard` bằng Lecturer/Admin;
  5. đổi đủ 5 tab, kiểm tra empty state bằng một SV chưa có hoạt động.
- **Hiệu năng:** autocannon cho p95 ≤ 2 s ở 100 kết nối.

# Nhập file SV từ màn Danh sách lớp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Từ `/teacher/classes`, giảng viên chọn một file `Students_[Mã môn]_[Mã lớp].xlsx`, xem trước trong hộp thoại, rồi bấm một nút để vừa tạo lớp (không bài tập) vừa thêm SV.

**Architecture:** BE thêm parser thuần `ClassFileImportParser` (tên file + ma trận sheet `Students` → thông tin lớp + dòng SV), lớp chuẩn hoá `XlsxCompatParser` để exceljs đọc được file xuất từ hệ thống nguồn, và `ClassFileImportService` với hai endpoint không trạng thái: `POST /classes/file-imports/preview` và `POST /classes/file-imports` (FE gửi lại cùng file, BE kiểm tra lại rồi tạo lớp + import log CONFIRMED + thành viên trong một transaction). FE thêm hook `useClassFileImport`, hộp thoại `ClassFileImportDialog` và nút "Nhập file SV" trên `ClassListPage`. Đổi mã nhạc cụ sang đuôi 103 ở `AudioConstant` và seed.

**Tech Stack:** BE: Express + Prisma + zod + exceljs + jszip; unit test `tsx --test` (`node:test` + `node:assert/strict`). FE: React 19 + Vitest/Testing Library.

**Spec:** `BVC-BE/docs/superpowers/specs/2026-11-11-class-file-import-design.md` — đọc trước khi làm bất kỳ task nào.

## Global Constraints

- Repo: `D:\BVC\BVC-BE` và `D:\BVC\BVC-FE`, cả hai đang ở nhánh `uat`. Không đổi nhánh.
- **KHÔNG commit, KHÔNG push.** Để thay đổi trong working tree; người dùng tự commit. (Bỏ qua mọi bước "Commit" của template.)
- **KHÔNG chạy `npm run test:integration` / `vitest` ở BE**, không chạy lệnh nào chạm DB (`prisma migrate`, `db push`, seed). Không sửa `schema.prisma`.
- Không sửa CI/CD (`.github/`, workflows).
- BE: đọc và theo `BVC-BE/.agents/rules/coding-convention.md`. Mỗi file mới export đúng một class; tên file PascalCase.
- FE: đọc và theo `BVC-FE/docs/RULES.md`. Dùng component/token có sẵn (`FormDialog`, `ActionButton`, `ImportRowCard`, màu `bvc-*`), không thêm màu mới.
- Mọi message hiển thị cho người dùng bằng tiếng Việt có dấu đầy đủ, đúng nguyên văn dưới đây.
- File mẫu thật: `D:\BVC\Students_DNH103_DNH103.E1.H2.xlsx` (chứa dữ liệu SV thật — **không copy vào repo**, chỉ dùng để kiểm tra thủ công bằng script tạm ngoài repo).
- Lệnh kiểm tra BE: `cd D:/BVC/BVC-BE && npm test && npm run typecheck && npm run lint`.
- Lệnh kiểm tra FE: `cd D:/BVC/BVC-FE && npm test -- --run && npm run typecheck && npm run lint`.

**Message (thêm vào `ClassConstant.messages`, dùng đúng nguyên văn):**

| Khoá | Nội dung |
|---|---|
| `FILE_IMPORT_ONLY_XLSX` | `Chỉ hỗ trợ file .xlsx.` |
| `FILE_IMPORT_NAME_INVALID` | `Tên file phải có dạng Students_[Mã môn]_[Mã lớp].xlsx.` |
| `FILE_IMPORT_SHEET_MISSING` | `File không có sheet Students.` |
| `FILE_IMPORT_CLASS_CODE_INVALID(code)` | `Mã lớp ${code} không đúng dạng [Mã môn].[Ca].H1 hoặc [Mã môn].[Ca].H2.` |
| `FILE_IMPORT_INCONSISTENT(rowNumber, field)` | `Dòng ${rowNumber}: ${field} không khớp với tên file hoặc các dòng khác.` (`field` ∈ `Kì học`, `Mã môn`, `Mã lớp`) |
| `FILE_IMPORT_TERM_MISSING(rowNumber)` | `Dòng ${rowNumber}: thiếu kì học.` |
| `SUBJECT_NOT_FOUND(code)` | `Mã môn ${code} chưa có trong hệ thống. Vui lòng liên hệ admin để thêm mã môn mới.` |
| `FILE_IMPORT_SEMESTER_NOT_FOUND(name)` | `Kì học ${name} chưa có trong hệ thống. Vui lòng liên hệ admin để thêm kì học.` |
| `FILE_IMPORT_CLASS_EXISTS(name, cohort)` | `Lớp ${name} kì ${cohort} đã tồn tại.` |
| `FILE_IMPORT_NO_VALID_ROWS` | `Không có sinh viên hợp lệ nào trong file.` |
| `fileImportSummary(className, imported, skipped)` | `Đã tạo lớp ${className} và nhập ${imported} sinh viên` + (skipped > 0 ? `, bỏ qua ${skipped} dòng.` : `.`) |

Các lỗi file khác (không đọc được, quá dung lượng, không có dòng, quá 200 dòng) dùng lại message hiện có trong `ClassConstant.messages` (`FILE_UNREADABLE`, `FILE_TOO_LARGE`, `FILE_NO_DATA`, `FILE_TOO_MANY_ROWS`).

## Review Focus

1. File xlsx **thường** (do Excel/exceljs tạo) vẫn đọc được như trước và chức năng nhập SV trong lớp cũ không đổi hành vi — chuẩn hoá chỉ chạy khi lần nạp đầu thất bại (Task 1 test file exceljs tạo đọc thẳng).
2. File có dòng trống cuối sheet, hoặc ô có khoảng trắng thừa (`" Fall2026 "`, `"dnh103"`) → bỏ dòng trống, trim, so khớp mã môn/mã lớp không phân biệt hoa thường; tên lớp lưu theo chữ in hoa của file (Task 2 test).
3. Tên file có hậu tố trình duyệt/hệ điều hành thêm khi tải trùng, ví dụ `Students_DNH103_DNH103.E1.H2 (1).xlsx` → coi là sai tên, báo `FILE_IMPORT_NAME_INVALID` (không đoán) (Task 2 test).
4. Nhạc cụ có mã khớp nhưng `isActive = false` → báo `SUBJECT_NOT_FOUND`, không tạo lớp (Task 3 test `collectBlockingErrors`).
5. Hai giảng viên cùng nhập một file gần như đồng thời → lần sau nhận `FILE_IMPORT_CLASS_EXISTS` (409), không tạo lớp trùng (Task 3: kiểm tra lại trong confirm + `ClassService.runUniqueGuarded`).

---

## File map

**BE (`D:\BVC\BVC-BE`)**
- Create `src/modules/classes/service/XlsxCompatParser.ts` (+ `.test.ts`) — chuẩn hoá gói xlsx.
- Modify `src/modules/classes/service/ImportFileParser.ts` — `readXlsx` thử lại qua `XlsxCompatParser`; thêm `readXlsxSheet(buffer, sheetName)`.
- Create `src/modules/classes/service/ClassFileImportParser.ts` (+ `.test.ts`) — parser thuần.
- Create `src/modules/classes/service/ClassFileImportService.ts` (+ `.test.ts` cho phần thuần).
- Modify `src/modules/classes/constant/ClassConstant.ts`, `src/types/ClassTypes.d.ts`, `src/modules/classes/repository/ClassRepository.ts`, `src/modules/classes/repository/ImportRepository.ts`, `src/modules/classes/service/MemberService.ts`, `src/modules/classes/controller/ClassController.ts`, `src/modules/classes/route/ClassRoute.ts`, `src/modules/classes/validation/ClassValidation.ts`, `package.json`.
- Modify `src/modules/audio/constant/AudioConstant.ts`, `prisma/seed/seed.ts`, `prisma/seed/ClassRoadmapSeed.ts`, `prisma/seed/ClassSeeder.ts`, test dùng mã cũ.

**FE (`D:\BVC\BVC-FE\src\features\classes`)**
- Modify `utils/semesterHalf.ts`, `types/classTypes.ts`, `api/classesApi.ts`.
- Create `hooks/useClassFileImport.ts` (+ `__tests__/useClassFileImport.test.ts`).
- Create `components/ClassFileImportDialog.tsx` (+ `__tests__/ClassFileImportDialog.test.tsx`).
- Modify `pages/ClassListPage.tsx` (+ cập nhật `__tests__/ClassListPage.test.tsx`).

---

### Task 1: BE — đọc được file xlsx xuất từ hệ thống nguồn

**Files:**
- Create: `src/modules/classes/service/XlsxCompatParser.ts`, `src/modules/classes/service/XlsxCompatParser.test.ts`
- Modify: `src/modules/classes/service/ImportFileParser.ts`, `package.json`

**Interfaces:**
- Produces: `XlsxCompatParser.normalizePart(partName: string, xml: string): string`; `XlsxCompatParser.normalizePackage(buffer: Buffer): Promise<Buffer>`; `ImportFileParser.loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook>` (thử nạp thẳng; thất bại thì `normalizePackage` rồi nạp lại; vẫn thất bại thì ném `FILE_UNREADABLE` code `MSG-08`); `ImportFileParser.readXlsxSheet(buffer: Buffer, sheetName: string): Promise<string[][] | null>` (`null` khi không có sheet tên đó, so khớp không phân biệt hoa thường). `readXlsx` hiện có dùng `loadWorkbook`.

- [ ] **Step 1: Thêm jszip làm dependency trực tiếp:** `cd D:/BVC/BVC-BE && npm install jszip@3.10.2` (đã có sẵn trong node_modules qua exceljs).

- [ ] **Step 2: Viết test thất bại** `XlsxCompatParser.test.ts`:
  - `normalizePart strips x: prefixes from workbook xml`: input `<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheets><x:sheet name="Students" sheetId="1" r:id="rId2" /></x:sheets></x:workbook>` với part `xl/workbook.xml` → kết quả chứa `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` và `<sheet name="Students"`, không chứa `x:`.
  - `normalizePart strips ap: prefixes from docProps/app.xml`: `<ap:Properties xmlns:ap="..."><ap:Application>Microsoft Excel</ap:Application></ap:Properties>` → `<Properties xmlns="..."><Application>Microsoft Excel</Application></Properties>`.
  - `normalizePart makes workbook rels targets relative`: part `xl/_rels/workbook.xml.rels`, `Target="/xl/worksheets/sheet1.xml"` → `Target="worksheets/sheet1.xml"`.
  - `normalizePart makes root rels targets relative`: part `_rels/.rels`, `Target="/xl/workbook.xml"` → `Target="xl/workbook.xml"`.
  - `normalizePart removes a leading BOM`: input bắt đầu bằng `\uFEFF<?xml` → kết quả bắt đầu bằng `<?xml`.
  - `normalizePackage makes a prefixed workbook readable by exceljs`: trong test dựng gói bằng JSZip: tạo workbook bằng exceljs (sheet `Students`, dòng 1 `TermName..Email`, dòng 2 `Fall2026, DNH103, DNH103.E1.H2, HE220687, Nguyễn Văn A, a@example.com`), `writeBuffer()`, mở bằng JSZip, viết lại `xl/workbook.xml` và `xl/worksheets/sheet1.xml` với tiền tố `x:` (thay `<` thành `<x:` cho thẻ phần tử, `xmlns=` thành `xmlns:x=`), đổi target trong `xl/_rels/workbook.xml.rels` sang tuyệt đối `/xl/...`. Khẳng định `ImportFileParser.readXlsxSheet(buf, 'Students')` trả về dòng 2 có `'DNH103.E1.H2'` và `'Nguyễn Văn A'`.
  - `readXlsxSheet reads a plain exceljs workbook directly` (Review Focus 1) và trả `null` với `readXlsxSheet(buf, 'Other')`.
  - `loadWorkbook throws FILE_UNREADABLE for garbage bytes`: `Buffer.from('not a zip')` → `AppError` với message `ClassConstant.messages.FILE_UNREADABLE`.

- [ ] **Step 3: Chạy** `cd D:/BVC/BVC-BE && npx tsx --test src/modules/classes/service/XlsxCompatParser.test.ts` — Expected: FAIL (module chưa có).

- [ ] **Step 4: Cài đặt** `XlsxCompatParser` theo các luật trong spec (mục "File đầu vào") — chỉ xử lý part `.xml`/`.rels`: bỏ BOM; với `_rels/.rels` bỏ `/` đầu trong `Target="/..."`; với `xl/_rels/workbook.xml.rels` đổi `Target="/xl/` thành `Target="`; bỏ tiền tố phần tử `x:`/`ap:` (`<x:`, `</x:`) và đổi `xmlns:x=`/`xmlns:ap=` thành `xmlns=`. Sửa `ImportFileParser` như Interfaces.

- [ ] **Step 5: Chạy lại test Step 3** — Expected: PASS.

- [ ] **Step 6: Kiểm tra với file thật (script tạm, không lưu vào repo):** viết script trong thư mục scratchpad gọi `ImportFileParser.readXlsxSheet(fs.readFileSync('D:/BVC/Students_DNH103_DNH103.E1.H2.xlsx'), 'Students')` bằng `npx tsx`, Expected: 14 dòng, dòng 2 = `Fall2026, DNH103, DNH103.E1.H2, HE220687, Phạm Chí Kiên, phamchikien09112008@gmail.com`.

- [ ] **Step 7: Chạy lệnh kiểm tra BE đầy đủ** — Expected: PASS hết.

### Task 2: BE — parser thuần cho file nhập lớp

**Files:**
- Create: `src/modules/classes/service/ClassFileImportParser.ts`, `src/modules/classes/service/ClassFileImportParser.test.ts`
- Modify: `src/modules/classes/constant/ClassConstant.ts` (thêm toàn bộ message trong bảng Global Constraints), `src/types/ClassTypes.d.ts`

**Interfaces:**
- Consumes: `Backend.RawStudentRow`, `StudentRowValidator.isEmptyRow`, `ClassConstant.importFile.MAX_DATA_ROWS`.
- Produces (khai báo trong `ClassTypes.d.ts`, namespace `Backend`):
  ```ts
  interface ParsedClassFile {
    subjectCode: string;   // "DNH103" (in hoa, đã trim)
    className: string;     // "DNH103.E1.H2" (in hoa, đã trim)
    semesterName: string;  // "Fall2026_H2" = termName (giữ nguyên chữ của file, đã trim) + "_" + "H2"
    rows: RawStudentRow[]; // rowNumber = số dòng trong sheet (dòng 2 = 2)
  }
  ```
  `ClassFileImportParser.parseFileName(fileName: string): { subjectCode: string; className: string }` và `ClassFileImportParser.parse(fileName: string, matrix: string[][]): Backend.ParsedClassFile` — cả hai ném `AppError.badRequest(message, { code: 'MSG-08' })` khi lỗi.

Luật: tên file khớp `/^Students_([A-Za-z0-9]+)_([A-Za-z0-9]+\.[A-Za-z0-9]+\.H[12])\.xlsx$/i` (sai → `FILE_IMPORT_NAME_INVALID`); mã lớp phải bắt đầu bằng `subjectCode + '.'` (sai → `FILE_IMPORT_CLASS_CODE_INVALID`); bỏ dòng 1; cột theo vị trí A..F = term, subject, class, studentCode, fullName, email; dòng trống (theo `isEmptyRow` trên 3 cột SV **và** A–C trống) bị bỏ; mỗi dòng còn lại: A trống → `FILE_IMPORT_TERM_MISSING`, B/C khác (không phân biệt hoa thường, sau trim) với tên file → `FILE_IMPORT_INCONSISTENT(row, 'Mã môn' | 'Mã lớp')`, A khác dòng dữ liệu đầu tiên → `FILE_IMPORT_INCONSISTENT(row, 'Kì học')`; 0 dòng → `FILE_NO_DATA`; > `MAX_DATA_ROWS` → `FILE_TOO_MANY_ROWS`.

- [ ] **Step 1: Viết test thất bại** `ClassFileImportParser.test.ts` (dùng helper `header = ['TermName','SubjectCode','ClassName','RollNumber','FullName','Email']`, `row(...)`):
  - `parse reads the sample layout`: tên `Students_DNH103_DNH103.E1.H2.xlsx`, 2 dòng dữ liệu → `{ subjectCode: 'DNH103', className: 'DNH103.E1.H2', semesterName: 'Fall2026_H2' }`, `rows[0]` = `{ rowNumber: 2, studentCode: 'HE220687', fullName: 'Phạm Chí Kiên', email: 'phamchikien09112008@gmail.com' }`.
  - `parse trims cells and matches codes case-insensitively` (Review Focus 2): ô `' Fall2026 '`, `'dnh103'`, `'dnh103.e1.h2'` → `semesterName === 'Fall2026_H2'`, `className === 'DNH103.E1.H2'`.
  - `parse skips blank trailing rows` (Review Focus 2): thêm `['','','','','','']` cuối → `rows.length === 2`.
  - `parseFileName rejects a duplicated-download suffix` (Review Focus 3): `Students_DNH103_DNH103.E1.H2 (1).xlsx` → message `FILE_IMPORT_NAME_INVALID`.
  - `parseFileName rejects missing parts / wrong extension`: `Students_DNH103.xlsx`, `DNH103_DNH103.E1.H2.xlsx`, `Students_DNH103_DNH103.E1.H2.csv` → `FILE_IMPORT_NAME_INVALID`.
  - `parseFileName rejects a class code without H1/H2`: `Students_DNH103_DNH103.E1.X2.xlsx` → `FILE_IMPORT_NAME_INVALID`.
  - `parse rejects a class code from another subject`: `Students_DNH103_DTR103.E1.H2.xlsx` → `FILE_IMPORT_CLASS_CODE_INVALID('DTR103.E1.H2')`.
  - `parse rejects a row with another subject / class / term`: dòng 3 có `DTR103` → `FILE_IMPORT_INCONSISTENT(3, 'Mã môn')`; `DNH103.E1.H1` → `(3, 'Mã lớp')`; `Spring2026` → `(3, 'Kì học')`.
  - `parse rejects a row without term`: dòng 2 cột A trống → `FILE_IMPORT_TERM_MISSING(2)`.
  - `parse rejects a file with only the header` → `FILE_NO_DATA`; `MAX_DATA_ROWS + 1` dòng → `FILE_TOO_MANY_ROWS`.

- [ ] **Step 2: Chạy** `npx tsx --test src/modules/classes/service/ClassFileImportParser.test.ts` — Expected: FAIL.
- [ ] **Step 3: Cài đặt** message, type, parser như Interfaces.
- [ ] **Step 4: Chạy lại** — Expected: PASS. Rồi chạy lệnh kiểm tra BE đầy đủ — PASS.

### Task 3: BE — service, endpoint xem trước và xác nhận

**Files:**
- Create: `src/modules/classes/service/ClassFileImportService.ts`, `src/modules/classes/service/ClassFileImportService.test.ts`
- Modify: `src/modules/classes/repository/ClassRepository.ts`, `src/modules/classes/repository/ImportRepository.ts`, `src/modules/classes/service/MemberService.ts`, `src/modules/classes/controller/ClassController.ts`, `src/modules/classes/route/ClassRoute.ts`, `src/modules/classes/validation/ClassValidation.ts`, `src/modules/classes/constant/ClassConstant.ts` (audit action nếu cần), `src/types/ClassTypes.d.ts`

**Interfaces:**
- Consumes: Task 1 `ImportFileParser.readXlsxSheet`, `ImportFileParser.detectFileType`; Task 2 `ClassFileImportParser.parse`, `Backend.ParsedClassFile`; có sẵn `ClassService.findSemester`-style lookup qua `SystemConfigService.getSemesters()`, `ClassRepository.findClassByCohortAndName`, `ClassRepository.createClass`, `RoadmapRepository.findLatestRoadmapId`, `MemberService.validateAgainstDatabase`/`enrollValidRows`/`runEnrollmentGuarded`, `ClassService.runUniqueGuarded`, `AuditLogger.record`, `ClassConstant.auditActions.CLASS_CREATE`/`IMPORT_CONFIRM`.
- Produces:
  - `ClassRepository.findInstrumentByCode(code: string): Promise<{ id: string; name: string; isActive: boolean } | null>` — `code` so khớp `equals` + `mode: 'insensitive'`.
  - `ImportRepository.createConfirmedLog(data: { classId; lecturerId; fileName; fileType; rows: Backend.ValidatedStudentRow[] }, client: Prisma.TransactionClient): Promise<Backend.ImportLogRecord>` — như `createPreviewLog` nhưng `status: 'CONFIRMED'`, `confirmedAt: new Date()`, chạy trên `client`.
  - `MemberService.buildValidationContext` / `validateAgainstDatabase` nhận `classId: string | null`; `null` → `activeMemberIds` rỗng, không truy vấn.
  - Types (`Backend`):
    ```ts
    interface ClassFilePreviewDTO {
      fileName: string;
      classInfo: { name: string; subjectCode: string; cohort: string; instrument: { id: string; name: string } | null; startDate: string | null; endDate: string | null };
      blockingErrors: string[];
      totalRows: number; validRows: number; errorRows: number;
      rows: ImportPreviewDTO['rows'];
    }
    interface ClassFileImportResult { classId: string; className: string; importedCount: number; skippedCount: number; message: string }
    ```
  - `ClassFileImportService.collectBlockingErrors(input: { subjectCode: string; className: string; semesterName: string; instrument: { isActive: boolean } | null; semester: Backend.Semester | null; isDuplicate: boolean; validRows: number }): string[]` — thuần; thứ tự: mã môn, kì học, lớp tồn tại, không có SV hợp lệ. Lớp tồn tại dùng `semester.name` (tên đã cấu hình) làm `cohort` trong message.
  - `ClassFileImportService.preview(lecturerId: string, file: Backend.UploadedImportFile): Promise<Backend.ClassFilePreviewDTO>`
  - `ClassFileImportService.confirm(lecturerId: string, file: Backend.UploadedImportFile): Promise<Backend.ClassFileImportResult>`
  - Route: `POST /classes/file-imports/preview` và `POST /classes/file-imports`, cả hai `validateRequest(ClassValidation.templateSchema)` (hoặc schema rỗng tương đương), `...lecturerOnly`, `receiveImportFile`; khai báo trước mọi route `/:id`. Controller trả `ApiResponse` giống `previewImport`/`confirmImport` hiện có (confirm trả message ở field message như `confirmImport`).

Luồng `preview`: `detectFileType` khác `xlsx` → `FILE_IMPORT_ONLY_XLSX`; `readXlsxSheet(buffer, 'Students')` null → `FILE_IMPORT_SHEET_MISSING`; `ClassFileImportParser.parse`; tra nhạc cụ, kì (so tên không phân biệt hoa thường), trùng lớp (chỉ khi có kì); `validateAgainstDatabase(null, rows, prisma)`; trả DTO (`startDate/endDate` từ kì hoặc null; `instrument` null khi không có hoặc không hoạt động; `cohort` = tên kì đã cấu hình nếu có, không thì `semesterName`). Không ghi DB.

Luồng `confirm`: chạy lại y như preview; `blockingErrors` không rỗng → ném lỗi đầu tiên (`FILE_IMPORT_CLASS_EXISTS` → `AppError.conflict(..., { code: 'MSG-08' })`, còn lại `AppError.badRequest(..., { code: 'MSG-08' })`); rồi `ClassService.runUniqueGuarded(() => MemberService.runEnrollmentGuarded(() => prisma.$transaction(async tx => { kiểm tra lại trùng lớp bằng tx; createClass(lecturerId, { name, cohort: semester.name, instrumentId, description: null, startDate/endDate = DateTimeUtil.toDateOnly(semester.*), roadmapId: await RoadmapRepository.findLatestRoadmapId(instrumentId) }, tx); validateAgainstDatabase(newClass.id, rows, tx); createConfirmedLog; enrollValidRows(..., { source: 'IMPORT', instrumentId, importLogId }, tx); AuditLogger CLASS_CREATE (payload { name, cohort, instrumentId, source: 'FILE_IMPORT', fileName }) và IMPORT_CONFIRM (payload { classId, importedCount, skippedCount }) }, { timeout: ClassConstant.limits.COPY_TRANSACTION_TIMEOUT_MS })))`; trả `message: messages.fileImportSummary(...)`. Lỗi trùng trong transaction (Review Focus 5) phải ra `FILE_IMPORT_CLASS_EXISTS` 409, không phải message trùng tên chung — bắt `isUniqueViolation`/kiểm tra lại trong tx và ném đúng lỗi này.

- [ ] **Step 1: Viết test thất bại** `ClassFileImportService.test.ts` cho `collectBlockingErrors` (base: `{ subjectCode: 'DNH103', className: 'DNH103.E1.H2', semesterName: 'Fall2026_H2', instrument: { isActive: true }, semester: { name: 'Fall2026_H2', startDate: '2026-11-09', endDate: '2026-12-27' }, isDuplicate: false, validRows: 13 }`):
  - `returns no errors for a clean file` → `[]`.
  - `reports a missing subject` (`instrument: null`) → `[SUBJECT_NOT_FOUND('DNH103')]`.
  - `treats an inactive instrument as missing` (Review Focus 4) → `[SUBJECT_NOT_FOUND('DNH103')]`.
  - `reports a missing semester` (`semester: null`) → `[FILE_IMPORT_SEMESTER_NOT_FOUND('Fall2026_H2')]`.
  - `reports an existing class` (`isDuplicate: true`) → `[FILE_IMPORT_CLASS_EXISTS('DNH103.E1.H2', 'Fall2026_H2')]`.
  - `reports no valid rows` (`validRows: 0`) → `[FILE_IMPORT_NO_VALID_ROWS]`.
  - `lists every error in order` (instrument null, semester null, validRows 0) → 3 lỗi theo thứ tự mã môn, kì, không SV hợp lệ.
  - `MemberService.buildValidationContext` với `classId: null` không gọi `findActiveMemberIds` — nếu khó test không DB thì bỏ, chỉ giữ typecheck.
- [ ] **Step 2: Chạy** `npx tsx --test src/modules/classes/service/ClassFileImportService.test.ts` — Expected: FAIL.
- [ ] **Step 3: Cài đặt** repository, service, controller, route, types như Interfaces.
- [ ] **Step 4: Chạy lại** — PASS; chạy lệnh kiểm tra BE đầy đủ — PASS.

### Task 4: BE — mã nhạc cụ đuôi 103 và tên kì mẫu

**Files:**
- Modify: `src/modules/audio/constant/AudioConstant.ts`, `prisma/seed/seed.ts`, `prisma/seed/ClassRoadmapSeed.ts`, `prisma/seed/ClassSeeder.ts`, `src/modules/platform/service/InstrumentService.test.ts`, `src/modules/practice/service/PracticeSettingsService.test.ts`, `tests/unit/InstrumentTuneService.test.ts` (chỉ nếu chúng phụ thuộc mã cũ của seed/AudioConstant — test dùng mã tuỳ ý như dữ liệu giả thì để nguyên).

- [ ] **Step 1:** `AudioConstant.rhythmInstruments`: thay khoá `DTR`, `DBA`, `DNH`, `DSA`, `DTB`, `DNG` bằng `DTR103`, `DBA103`, `DNH103`, `DSA103`, `DTB103`, `DNG103` (giá trị giữ nguyên); giữ các bí danh dài. Nếu có test của AudioConstant/mapping dùng `DNH` → cập nhật sang `DNH103`.
- [ ] **Step 2:** `seed.ts`: mã trong `DatabaseSeeder.instruments` đổi sang đuôi 103 (cả khoá `instrumentTunes` và mọi chỗ `instrument: 'DSA'`, `findInstrumentId('...')`…); thêm vào `legacyInstrumentCodes` các cặp `DTR→DTR103`, `DBA→DBA103`, `DSA→DSA103`, `DTB→DTB103`, `DNH→DNH103` (giữ các cặp cũ, nhưng nếu cặp cũ đang trỏ tới mã ngắn thì trỏ thẳng tới mã 103). `ClassRoadmapSeed.ts`: `INSTRUMENT_CODES` đổi sang đuôi 103; `SEED_SEMESTERS` đổi tên `SP26_H1→Spring2026_H1`, `SP26_H2→Spring2026_H2`, `SU26_H1→Summer2026_H1`, `SU26_H2→Summer2026_H2`, `FA26_H1→Fall2026_H1`, `FA26_H2→Fall2026_H2` và mọi chỗ tham chiếu tên đó. `ClassSeeder.ts`: `instrumentCode` đổi sang đuôi 103. Tên lớp mẫu trong seed nếu bắt đầu bằng mã môn cũ thì vẫn hợp lệ — không cần đổi.
- [ ] **Step 3:** `grep -rn "'DTR'\|'DBA'\|'DSA'\|'DTB'\|'DNH'\|SP26_H\|SU26_H\|FA26_H" src prisma tests` — Expected: chỉ còn chỗ có chủ ý (bí danh, cặp legacy).
- [ ] **Step 4:** Chạy lệnh kiểm tra BE đầy đủ — PASS. **Không chạy seed.**

### Task 5: FE — tên kì `_H`, types, API, hook

**Files:**
- Modify: `utils/semesterHalf.ts`, `__tests__/semesterHalf.test.ts`, `types/classTypes.ts`, `api/classesApi.ts`
- Create: `hooks/useClassFileImport.ts`, `__tests__/useClassFileImport.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ClassFileImportPreview {
    fileName: string;
    classInfo: { name: string; subjectCode: string; cohort: string; instrument: { id: string; name: string } | null; startDate: string | null; endDate: string | null };
    blockingErrors: string[];
    totalRows: number; validRows: number; errorRows: number;
    rows: ImportRow[];
  }
  export interface ClassFileImportResult { classId: string; className: string; importedCount: number; skippedCount: number }
  ```
  `classesApi.previewClassFileImport(file: File)` → `POST /classes/file-imports/preview`; `classesApi.confirmClassFileImport(file: File)` → `POST /classes/file-imports` (multipart, cùng field name và header như `previewImport`).
  `useClassFileImport()` → `{ phase: 'idle' | 'uploading' | 'preview' | 'confirming'; file: File | null; fileError: string | null; preview: ClassFileImportPreview | null; canConfirm: boolean; selectFile(file: File): Promise<void>; confirm(): Promise<{ message: string; result: ClassFileImportResult } | { error: string }>; reset(): void }`. `canConfirm` = phase `preview` && `blockingErrors.length === 0` && `validRows > 0`. Lỗi API lấy message từ body như `useImportStudents` (dùng lại helper đang dùng ở đó). Chọn file mới khi đang preview thì thay thế preview. Chọn file không phải `.xlsx` → `fileError = 'Chỉ hỗ trợ file .xlsx.'`, không gọi API.

- [ ] **Step 1: Viết test thất bại:**
  - `semesterHalf.test.ts`: `halfOfSemesterName('Fall2026_H2') === 2`, `halfOfSemesterName('Spring2027_h1') === 1`, `halfOfSemesterName('FA26-H1') === 1` vẫn đúng, `halfOfSemesterName('Fall2026H2') === null`.
  - `useClassFileImport.test.ts` (mock `classesApi`): `selectFile` gọi `previewClassFileImport` và đưa phase về `preview`; `canConfirm` false khi `blockingErrors` có phần tử, false khi `validRows === 0`, true khi sạch; `confirm` gọi `confirmClassFileImport` với **đúng File đã chọn** và trả `message`; file `.csv` → `fileError === 'Chỉ hỗ trợ file .xlsx.'` và không gọi API; API lỗi khi preview → `fileError` = message từ body, phase `idle`.
- [ ] **Step 2: Chạy** `cd D:/BVC/BVC-FE && npx vitest run src/features/classes/__tests__/semesterHalf.test.ts src/features/classes/__tests__/useClassFileImport.test.ts` — Expected: FAIL.
- [ ] **Step 3: Cài đặt:** `HALF_NAME_PATTERN = /^(.+)[-_]H([12])$/i` (cập nhật comment); types, API, hook như Interfaces.
- [ ] **Step 4: Chạy lại** — PASS; chạy lệnh kiểm tra FE đầy đủ — PASS.

### Task 6: FE — hộp thoại và nút "Nhập file SV"

**Files:**
- Create: `components/ClassFileImportDialog.tsx`, `__tests__/ClassFileImportDialog.test.tsx`
- Modify: `pages/ClassListPage.tsx`, `__tests__/ClassListPage.test.tsx`

**Interfaces:**
- Consumes: Task 5 `useClassFileImport`, `ClassFileImportPreview`; có sẵn `FormDialog` (xem cách `ClassCreateDialog` dùng), `ActionButton`, `ImportRowCard`, `toast`, `formatDate`/hàm định dạng ngày trong `utils/classFormat.ts` nếu có.
- Produces: `ClassFileImportDialog({ open: boolean; onClose: () => void; onImported: () => void })`.

Giao diện (mockup B đã duyệt): tiêu đề `Nhập file SV`; khối chọn file (tên file hoặc `Chưa chọn file`, nút `Chọn file` / `Đổi file`, `accept=".xlsx"`, gợi ý `File Students_[Mã môn]_[Mã lớp].xlsx, sheet Students, tối đa 2 MB và 200 dòng.`); `fileError` dạng `role="alert"`; khi có preview: các `blockingErrors` mỗi cái một `role="alert"` ở trên cùng; khối thông tin `Tên lớp` / `Mã môn` (`DNH103 · Đàn nhị`, hoặc chỉ mã khi instrument null) / `Kì học` (`Fall2026_H2 · 09/11/2026 – 27/12/2026`, hoặc chỉ tên khi chưa có ngày); hai số `dòng hợp lệ` / `dòng bị bỏ qua`; danh sách `ImportRowCard` cuộn được trong hộp thoại. Footer: `Hủy` và nút chính `Tạo lớp & nhập {validRows} SV` (`Đang tạo lớp…` khi confirming), disabled khi `!canConfirm`. Thành công: `toast.success(message)`, `reset()`, `onImported()`, `onClose()`. Thất bại: `toast.error(error)`, giữ hộp thoại. Đóng hộp thoại thì `reset()`.

`ClassListPage`: thêm nút `Nhập file SV` (variant `secondary`, icon `Upload` của lucide-react) cạnh `Tạo lớp mới` ở cả `DesktopClassList` và `MobileClassList` (thêm prop `onImport` vào `ClassListViewProps`); dùng `useCreateDialog()` thứ hai để mở/đóng; `onImported` gọi `reload` của `useClassList`.

- [ ] **Step 1: Viết test thất bại:**
  - `ClassFileImportDialog.test.tsx` (mock `useClassFileImport` hoặc `classesApi`): hiện `DNH103.E1.H2`, `DNH103 · Đàn nhị`, `Fall2026_H2`, nút `Tạo lớp & nhập 13 SV` bật với preview sạch; với `blockingErrors: ['Mã môn DNH103 chưa có trong hệ thống. Vui lòng liên hệ admin để thêm mã môn mới.']` → thấy message trong `role="alert"` và nút bị disabled; bấm nút khi sạch → gọi confirm, `toast.success` với message, gọi `onImported` và `onClose`; confirm lỗi → `toast.error`, không gọi `onClose`.
  - `ClassListPage.test.tsx`: có nút `Nhập file SV`; bấm thì hộp thoại có tiêu đề `Nhập file SV` hiện ra.
- [ ] **Step 2: Chạy** `npx vitest run src/features/classes/__tests__/ClassFileImportDialog.test.tsx src/features/classes/__tests__/ClassListPage.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Cài đặt** như mô tả.
- [ ] **Step 4: Chạy lại** — PASS; chạy lệnh kiểm tra FE đầy đủ — PASS.

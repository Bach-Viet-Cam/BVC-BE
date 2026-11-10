# Nhập file SV từ màn Danh sách lớp — Design

## Mục đích

Mỗi đầu kì giảng viên nhận khoảng 6 file danh sách sinh viên, mỗi file ứng với một lớp (hệ thống nguồn không xuất được một file cho cả 6 lớp). Hiện tại giảng viên phải tự tạo từng lớp rồi vào lớp để nhập SV. Tính năng này gộp hai bước lại: từ `/teacher/classes`, chọn một file, xem trước, rồi bấm một nút để vừa tạo lớp vừa thêm SV. Lớp tạo ra **không có bài tập**.

## File đầu vào

- Tên file: `Students_[Mã môn]_[Mã lớp].xlsx`, ví dụ `Students_DNH103_DNH103.E1.H2.xlsx`. File mẫu: `D:\BVC\Students_DNH103_DNH103.E1.H2.xlsx`.
- Có sheet tên `Students`. Dòng 1 là tiêu đề (`TermName, SubjectCode, ClassName, RollNumber, FullName, Email`), dữ liệu từ dòng 2.
- Cột: A kì (`Fall2026`), B mã môn (`DNH103`), C mã lớp (`DNH103.E1.H2`), D mã SV, E họ tên, F email. Đọc theo **vị trí cột**, không theo tiêu đề.
- Chỉ nhận `.xlsx`. Giới hạn dung lượng và số dòng dùng lại của chức năng nhập SV hiện có (2 MB, 200 dòng).
- File xuất từ hệ thống nguồn ghi XML theo kiểu exceljs không đọc được (tiền tố namespace `x:`/`ap:`, đường dẫn tuyệt đối `/xl/...` trong `.rels`). Đã kiểm chứng: chuẩn hoá lại các phần XML bằng `jszip` (bỏ tiền tố `x:`/`ap:`, đổi `Target="/xl/..."` trong `xl/_rels/workbook.xml.rels` thành đường dẫn tương đối, bỏ `/` đầu trong `_rels/.rels`, bỏ BOM) rồi nạp lại bằng exceljs thì đọc được đầy đủ. Áp dụng chuẩn hoá này **khi lần nạp đầu thất bại** (file xlsx thường không bị ảnh hưởng). Nên dùng chung cho cả chức năng nhập SV trong lớp hiện có.

## Cách suy ra thông tin lớp

- **Tên lớp** = mã lớp (cột C), ví dụ `DNH103.E1.H2`.
- **Mã lớp** phải có dạng `[Mã môn].<ca>.H1|H2` và bắt đầu bằng đúng mã môn kèm dấu chấm.
- **Nhạc cụ** = nhạc cụ có `code` **khớp nguyên văn** với mã môn (không phân biệt hoa thường, không khớp một phần, không bỏ phần số) và đang hoạt động. Mỗi nhạc cụ có đúng một mã môn (quyết định của người dùng); admin đặt mã nhạc cụ thành mã môn, ví dụ Đàn nhị = `DNH103`.
- **Kì học** = cột A + `_` + đuôi mã lớp, ví dụ `Fall2026` + `H2` → `Fall2026_H2`. Tên này phải khớp với một kì admin đã cấu hình (`class.semesters`, so khớp không phân biệt hoa thường như `ClassService.findSemester`). Ngày bắt đầu và kết thúc của lớp lấy từ kì, giống luồng tạo lớp hiện có.
- Mô tả để trống, không có giảng viên cùng dạy, roadmap = phiên bản mới nhất của nhạc cụ (giống `createClass`).

## Kiểm tra

**Lỗi file** (trả lỗi ngay, không có màn xem trước):
- không phải `.xlsx`, quá dung lượng, không đọc được;
- tên file sai dạng `Students_[Mã môn]_[Mã lớp].xlsx`;
- không có sheet `Students`;
- không có dòng dữ liệu nào, hoặc quá số dòng cho phép;
- mã lớp sai dạng;
- **(quyết định của Claude)** dữ liệu không nhất quán: tên file và các dòng phải cùng một mã môn, mã lớp và kì. Có dòng nào khác thì báo lỗi kèm số dòng, không đoán.

**Lỗi chặn** (có màn xem trước nhưng khoá nút tạo lớp; trả về **tất cả** lỗi gặp phải):
- mã môn chưa có: `Mã môn DNH103 chưa có trong hệ thống. Vui lòng liên hệ admin để thêm mã môn mới.` (nhạc cụ ngừng hoạt động cũng báo như vậy);
- kì học chưa có: `Kì học Fall2026_H2 chưa có trong hệ thống. Vui lòng liên hệ admin để thêm kì học.`;
- lớp đã tồn tại (cùng kì, trùng tên, không phân biệt hoa thường — dùng `ClassRepository.findClassByCohortAndName`): `Lớp DNH103.E1.H2 kì Fall2026_H2 đã tồn tại.` Không gộp SV vào lớp cũ (quyết định của người dùng);
- không có SV hợp lệ nào.

**Từng dòng SV**: dùng nguyên `StudentRowValidator` / `MemberService.validateAgainstDatabase` hiện có (với lớp mới thì chưa có thành viên). Dòng sai bị bỏ qua và ghi lý do; email chưa có tài khoản thì tạo tài khoản ở trạng thái chờ kích hoạt khi xác nhận.

## Luồng

1. Ở `/teacher/classes` (cả giao diện desktop lẫn mobile), nút **"Nhập file SV"** đặt cạnh nút "Tạo lớp mới".
2. Bấm vào thì mở **hộp thoại nổi** (phương án B người dùng đã chọn) có nút chọn một file `.xlsx`.
3. Chọn file thì FE gửi file lên endpoint xem trước. Hộp thoại hiện: tên file (cho đổi file), tên lớp, mã môn kèm tên nhạc cụ, kì kèm ngày bắt đầu và kết thúc, số dòng hợp lệ và số dòng bỏ qua, danh sách dòng (dùng lại `ImportRowCard`), các lỗi chặn ở trên cùng.
4. Nút **"Tạo lớp & nhập N SV"** chỉ bật khi không có lỗi chặn và N > 0. Bấm thì FE gửi **lại chính file đó** lên endpoint xác nhận. BE đọc và kiểm tra lại toàn bộ, rồi trong **một transaction** tạo lớp, tạo import log trạng thái `CONFIRMED` gắn với lớp mới, thêm SV và ghi audit (`CLASS_CREATE`, `IMPORT_CONFIRM`). Lỗi ở bất kỳ bước nào thì không tạo gì.
5. Thành công: toast `Đã tạo lớp DNH103.E1.H2 và nhập N sinh viên` (kèm số dòng bỏ qua nếu có), đóng hộp thoại, tải lại danh sách lớp, **ở lại màn danh sách** (quyết định của Claude).

Không lưu gì ở bước xem trước (không bảng mới, không migration): bước xác nhận nhận lại file, nên không cần preview log.

## API (quyết định của Claude)

- `POST /classes/file-imports/preview` — multipart, field file giống chức năng nhập hiện có (`ClassConstant.importFile.FORM_FIELD`, middleware `receiveImportFile`), chỉ giảng viên. Trả về: `fileName`, `classInfo { name, subjectCode, cohort, instrument { id, name } | null, startDate | null, endDate | null }`, `blockingErrors: string[]`, `totalRows`, `validRows`, `errorRows`, `rows` (cùng dạng dòng với `ImportPreviewDTO`).
- `POST /classes/file-imports` — cùng dạng multipart. Trả về `{ classId, className, importedCount, skippedCount, message }`. Lỗi chặn trả 4xx với message tiếng Việt như trên (lớp đã tồn tại: 409; còn lại: 400).
- Khai báo các route này **trước** các route `/:id`.

## Dữ liệu cấu hình (quyết định của người dùng)

- Mã nhạc cụ đổi sang đuôi 103: `DTR103` Đàn tranh, `DBA103` Đàn bầu, `DSA103` Sáo trúc, `DTB103` Tỳ bà, `DNH103` Đàn nhị (`DNG103` Đàn nguyệt nếu có).
- `AudioConstant.rhythmInstruments`: thay các khoá ngắn (`DTR`, `DBA`, `DNH`, `DSA`, `DTB`, `DNG`) bằng khoá đuôi 103, giữ các bí danh dài (`DAN_NHI`, `dan-nhi`, …).
- Seed: cập nhật mã nhạc cụ ở `seed.ts` (thêm cặp đổi mã cũ sang mới vào `legacyInstrumentCodes`), `ClassRoadmapSeed.ts`, `ClassSeeder.ts`; đổi tên kì mẫu sang dạng `Spring2026_H1`, `Summer2026_H1`, `Fall2026_H1`, `Fall2026_H2`, … Sửa test đang dùng mã cũ.
- **(quyết định của Claude)** FE `semesterHalf.ts`: `HALF_NAME_PATTERN` nhận cả `-H1` và `_H1`, để form "Tạo lớp mới" vẫn tự chọn được kì khi kì đổi tên sang `Fall2026_H2`. Form tạo lớp thủ công tìm nhạc cụ theo tiền tố (`findInstrumentBySubject`), vẫn chạy được với mã `DNH103`.

## Ngoài phạm vi

- Chọn nhiều file một lần.
- Gộp SV vào lớp đã tồn tại.
- Nhiều mã môn cho một nhạc cụ, hay bảng mã môn riêng.
- Tự tạo kì học hoặc nhạc cụ.
- Bài tập.
- Không chạy migration, `db push`, seed hay test integration (DB dùng chung), không commit.

## Để người xây dựng tự quyết

Tên class/file cụ thể theo convention của từng repo, cách tách parser thuần ra để unit test, giao diện chi tiết của hộp thoại (dùng primitive và token `bvc-*` có sẵn).

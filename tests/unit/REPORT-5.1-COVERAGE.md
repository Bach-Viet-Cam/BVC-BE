# Report 5.1 unit tests: one file per sheet tab

Every row of a service tab in the workbook is a test named `UTC-xx-nnn ...` in `tests/unit/<Tab>.test.ts`
(for example `tests/unit/SubmissionProgressService.test.ts` runs UTC-SP-001 to UTC-SP-023). Run one file per tab for the evidence.

The tables below list the sheet rows whose behaviour is **also** asserted by an existing repo test
(`src/modules/practice/service/*.test.ts` or the Vitest files in this folder). Those existing tests are left unchanged,
so these behaviours are tested twice; the table shows where, in case you later remove either copy.

## How to run

```powershell
cd D:\doan\code\BVC-BE
npx tsx --test tests/unit/<Tab>.test.ts                       # the tab files in this folder
npx tsx --test "src/modules/practice/**/*.test.ts"             # existing colocated practice tests (node:test)
npx vitest run --config tests/unit/vitest.unit.config.ts tests/unit/ChallengeRules.test.ts tests/unit/ChallengeWeekCalculator.test.ts tests/unit/LeaderboardMetricCalculator.test.ts tests/unit/LeaderboardRankingCalculator.test.ts   # existing Vitest unit tests (no database)
```

## PracticeSubmissionService (UTC-PR-...)

| Sheet ID | Covered by (existing repo test) |
|---|---|
| UTC-PR-001 | `src/modules/practice/service/PracticeAssignmentResolver.test.ts › Chỉ bản MAIN của nhạc cụ lớp mới khớp bài tập` |
| UTC-PR-002 | `src/modules/practice/service/PracticeAssignmentResolver.test.ts › Chỉ bản MAIN của nhạc cụ lớp mới khớp bài tập` |
| UTC-PR-003 | `src/modules/practice/service/PracticeAssignmentResolver.test.ts › Chỉ bản MAIN của nhạc cụ lớp mới khớp bài tập` |
| UTC-PR-004 | `src/modules/practice/service/PracticeAssignmentResolver.test.ts › Bài nộp hòa tấu chỉ ghép bài tập loại Hòa tấu / Bài nộp độc tấu không bao giờ ghép bài tập Hòa tấu` |
| UTC-PR-005 | `src/modules/practice/service/PracticeAssignmentResolver.test.ts › Trạng thái: còn lượt, hết lượt, quá hạn, bài tập đã đóng, lớp đã kết thúc` |
| UTC-PR-006 | `src/modules/practice/service/PracticeAssignmentResolver.test.ts › Trạng thái: còn lượt, hết lượt, quá hạn, bài tập đã đóng, lớp đã kết thúc` |
| UTC-PR-008 | `src/modules/practice/service/PracticeAssignmentResolver.test.ts › Trạng thái: còn lượt, hết lượt, quá hạn, bài tập đã đóng, lớp đã kết thúc` |
| UTC-PR-009 | `src/modules/practice/service/PracticeAssignmentResolver.test.ts › Sinh viên ở nhiều lớp: chọn lớp chứa bài tập được chỉ định, rồi lớp cùng nhạc cụ đã giao bài này` |
| UTC-PR-010 | `src/modules/practice/service/PracticeAssignmentResolver.test.ts › Sinh viên ở nhiều lớp: chọn lớp chứa bài tập được chỉ định, rồi lớp cùng nhạc cụ đã giao bài này` |
| UTC-PR-011 | `src/modules/practice/service/PracticeAssignmentResolver.test.ts › Sinh viên ở nhiều lớp: chọn lớp chứa bài tập được chỉ định, rồi lớp cùng nhạc cụ đã giao bài này` |
| UTC-PR-012 | `src/modules/practice/service/PracticeAssignmentResolver.test.ts › Nhiều bài tập: ưu tiên assignmentId gợi ý, rồi bài còn mở có hạn gần nhất, rồi bài mới nhất` |
| UTC-PR-014 | `src/modules/practice/service/PracticeAssignmentResolver.test.ts › Hòa tấu: bản nhạc theo nhạc cụ của thành viên được tính dù khác nhạc cụ lớp` |
| UTC-PR-015 | `src/modules/practice/service/EvaluationJobBuilderService.test.ts › build gắn templateAnalysisId khi bản mẫu READY và callbackUrl theo path` |
| UTC-PR-016 | `src/modules/practice/service/EvaluationJobBuilderService.test.ts › build bỏ templateAnalysisId khi bản mẫu chưa READY` |
| UTC-PR-020 | `src/modules/practice/service/PracticeSubmissionService.test.ts › Gửi bản thu tạo Submission Đang xử lý và gửi job theo bản nhạc học viên đã chọn` |
| UTC-PR-022 | `src/modules/practice/service/PracticeSubmissionService.test.ts › Bản không phải MAIN, nhạc cụ khác, chưa có lớp, quá hạn hoặc lớp đã kết thúc: không tính vào bài tập và không bị chặn` |
| UTC-PR-023 | `src/modules/practice/service/PracticeSubmissionService.test.ts › Bản không phải MAIN, nhạc cụ khác, chưa có lớp, quá hạn hoặc lớp đã kết thúc: không tính vào bài tập và không bị chặn` |
| UTC-PR-024 | `src/modules/practice/service/PracticeSubmissionService.test.ts › Bản nhạc sai, chưa có bản thu mẫu hoặc file không thuộc học viên đều bị từ chối` |
| UTC-PR-025 | `src/modules/practice/service/PracticeSubmissionService.test.ts › Bản nhạc sai, chưa có bản thu mẫu hoặc file không thuộc học viên đều bị từ chối` |
| UTC-PR-026 | `src/modules/practice/service/PracticeSubmissionService.test.ts › Bản nhạc sai, chưa có bản thu mẫu hoặc file không thuộc học viên đều bị từ chối` |
| UTC-PR-027 | `src/modules/practice/service/PracticeSubmissionService.test.ts › GBR-49: bài đang xử lý của cùng bản nhạc trả về 409 kèm mã bản nộp` |
| UTC-PR-028 | `src/modules/practice/service/PracticeSubmissionService.test.ts › Gửi hàng đợi thất bại thì chuyển Lỗi xử lý và cho thử lại` |
| UTC-PR-034 | `src/modules/practice/service/PracticeSubmissionService.test.ts › Thử lại giữ bản nộp và file, gửi job mới từ bước kiểm tra chất lượng` |
| UTC-PR-035 | `src/modules/practice/service/PracticeSubmissionService.test.ts › Không cho thử lại quá sớm, khi hết lượt hoặc khi bản nộp không lỗi` |
| UTC-PR-036 | `src/modules/practice/service/PracticeSubmissionService.test.ts › Không cho thử lại quá sớm, khi hết lượt hoặc khi bản nộp không lỗi` |
| UTC-PR-038 | `src/modules/practice/service/PracticeSubmissionService.test.ts › Không cho thử lại quá sớm, khi hết lượt hoặc khi bản nộp không lỗi` |

## SubmissionProgressService (UTC-SP-...)

| Sheet ID | Covered by (existing repo test) |
|---|---|
| UTC-SP-001 | `src/modules/practice/service/PracticeResultService.test.ts › Độ lệch tempo: chọn cách đọc gần tempo bản mẫu nhất khi máy đo nhịp bắt nhầm gấp đôi / một nửa` |
| UTC-SP-002 | `src/modules/practice/service/PracticeResultService.test.ts › Độ lệch tempo: chọn cách đọc gần tempo bản mẫu nhất khi máy đo nhịp bắt nhầm gấp đôi / một nửa` |
| UTC-SP-003 | `src/modules/practice/service/PracticeResultService.test.ts › Độ lệch tempo: chọn cách đọc gần tempo bản mẫu nhất khi máy đo nhịp bắt nhầm gấp đôi / một nửa` |
| UTC-SP-004 | `src/modules/practice/service/SubmissionProgressService.test.ts › Bước bắt đầu cập nhật stage theo thứ tự, không lùi lại và bỏ qua lượt cũ` |
| UTC-SP-005 | `src/modules/practice/service/SubmissionProgressService.test.ts › Bước bắt đầu cập nhật stage theo thứ tự, không lùi lại và bỏ qua lượt cũ` |
| UTC-SP-007 | `src/modules/practice/service/SubmissionProgressService.test.ts › Hoàn tất lưu kết quả, accuracy, độ lệch tempo và nhận xét; callback lặp lại bị bỏ qua` |
| UTC-SP-008 | `src/modules/practice/service/SubmissionProgressService.test.ts › Bước JOB-02/03 xong không đổi trạng thái` |
| UTC-SP-009 | `src/modules/practice/service/SubmissionProgressService.test.ts › Từ chối chất lượng lưu lý do và không bị tính (REJECTED)` |
| UTC-SP-012 | `src/modules/practice/service/SubmissionProgressService.test.ts › Bước bắt đầu cập nhật stage theo thứ tự, không lùi lại và bỏ qua lượt cũ` |
| UTC-SP-014 | `src/modules/practice/service/SubmissionProgressService.test.ts › Hoàn tất lưu kết quả, accuracy, độ lệch tempo và nhận xét; callback lặp lại bị bỏ qua` |
| UTC-SP-015 | `src/modules/practice/service/SubmissionProgressService.test.ts › Lỗi lần đầu mở thử lại sau 5 giây, các lần sau 10 giây, hết lượt thì xóa file` |
| UTC-SP-016 | `src/modules/practice/service/SubmissionProgressService.test.ts › Lỗi lần đầu mở thử lại sau 5 giây, các lần sau 10 giây, hết lượt thì xóa file` |
| UTC-SP-019 | `src/modules/practice/service/SubmissionProgressService.test.ts › Callback bị mất thì đối soát theo trạng thái của Rhythm` |
| UTC-SP-020 | `src/modules/practice/service/SubmissionProgressService.test.ts › Callback bị mất thì đối soát theo trạng thái của Rhythm` |
| UTC-SP-021 | `src/modules/practice/service/SubmissionProgressService.test.ts › Không nhận kết quả của mã xử lý hoặc lượt thử cũ` |
| UTC-SP-022 | `src/modules/practice/service/SubmissionProgressService.test.ts › Job không bị đánh dấu lỗi chỉ vì chạy lâu hoặc Rhythm tạm thời chưa phản hồi` |

## PracticeResultService (UTC-RS-...)

| Sheet ID | Covered by (existing repo test) |
|---|---|
| UTC-RS-001 | `src/modules/practice/service/ClassRankService.test.ts › Vị trí trong lớp: tốt hơn bao nhiêu % bạn cùng lớp, top %, điểm trung bình và phân bố điểm` |
| UTC-RS-002 | `src/modules/practice/service/ClassRankService.test.ts › GBR-53: dưới 3 bạn cùng lớp có kết quả thì chỉ trả điểm của mình, không xếp hạng` |
| UTC-RS-004 | `src/modules/practice/service/ClassRankService.test.ts › Đứng đầu lớp vẫn hiển thị top 1%, không phải top 0%` |
| UTC-RS-005 | `src/modules/practice/service/PracticeResultService.test.ts › Kết quả gồm điểm tổng, điểm thành phần, tempo đã chỉnh lỗi nửa nhịp, nhận xét AI, lỗi và audio` |
| UTC-RS-006 | `src/modules/practice/service/PracticeResultService.test.ts › File bản thu đã xóa thì không trả link nghe bản thu` |
| UTC-RS-007 | `src/modules/practice/service/PracticeResultService.test.ts › Bản nộp đang xử lý chỉ trả thông tin nhận diện; kết quả JSON hỏng không làm lỗi màn hình` |
| UTC-RS-008 | `src/modules/practice/service/PracticeResultService.test.ts › Không phải bài của học viên trả 404; lịch sử, xếp hạng và biểu đồ của bài chưa xong trả 409` |
| UTC-RS-009 | `src/modules/practice/service/PracticeResultService.test.ts › Tiến trình: các lần nộp cũ trước, đánh số theo tổng số lần, chênh lệch so với lần trước` |
| UTC-RS-010 | `src/modules/practice/service/PracticeResultService.test.ts › Không phải bài của học viên trả 404; lịch sử, xếp hạng và biểu đồ của bài chưa xong trả 409` |
| UTC-RS-011 | `src/modules/practice/service/PracticeResultService.test.ts › Xếp hạng lớp chỉ có khi bài nộp thuộc bài tập của lớp` |
| UTC-RS-012 | `src/modules/practice/service/PracticeResultService.test.ts › Xếp hạng lớp chỉ có khi bài nộp thuộc bài tập của lớp` |
| UTC-RS-013 | `src/modules/practice/service/PracticeResultService.test.ts › Biểu đồ cao độ: dựng từ file phân tích rồi lưu lại; lần sau dùng bản đã lưu, không gọi Rhythm` |
| UTC-RS-014 | `src/modules/practice/service/SubmissionHistoryService.test.ts › Lịch sử trả bài nộp kèm tên bài, loại bài, phân trang và số đếm theo trạng thái / Ngày lọc là ngày Việt Nam, tính cả hai đầu; trang 3 bỏ qua 40 bài` |

## PracticeContextService (UTC-PC-...)

| Sheet ID | Covered by (existing repo test) |
|---|---|
| UTC-PC-001 | `src/modules/practice/service/PracticeContextService.test.ts › Sinh viên trong lớp mở bản chính: trả bài tập với lượt còn lại và tốc độ mặc định của bài nhạc` |
| UTC-PC-002 | `src/modules/practice/service/PracticeContextService.test.ts › Chưa có lớp thì NO_CLASS, bản không phải MAIN thì không có bài tập` |
| UTC-PC-004 | `src/modules/practice/service/PracticeContextService.test.ts › Bản thu mẫu: dùng bản thu của chính bản nhạc; bản phụ chưa có thì dùng bản thu của bản chính` |
| UTC-PC-005 | `src/modules/practice/service/PracticeContextService.test.ts › Chưa có lớp thì NO_CLASS, bản không phải MAIN thì không có bài tập` |
| UTC-PC-007 | `src/modules/practice/service/PracticeContextService.test.ts › Lớp đã kết thúc vẫn trả hạn nộp nhưng không còn tính vào bài tập; bản không tồn tại trả 404` |
| UTC-PC-008 | `src/modules/practice/service/PracticeSettingsService.test.ts › Tốc độ luyện: lấy BPM của bài tập khi bản nhạc được giao cho lớp của sinh viên` |
| UTC-PC-009 | `src/modules/practice/service/PracticeSettingsService.test.ts › Tốc độ luyện: mặc định 60 khi không thuộc lớp, bài không được giao hoặc bài tập chưa đặt BPM` |
| UTC-PC-011 | `src/modules/practice/service/PracticeSettingsService.test.ts › Tốc độ luyện: mặc định 60 khi không thuộc lớp, bài không được giao hoặc bài tập chưa đặt BPM` |
| UTC-PC-012 | `src/modules/practice/service/PracticeSettingsService.test.ts › Bản nhạc không tồn tại trả 404 cho cả hai API` |
| UTC-PC-013 | `src/modules/practice/service/PracticeSettingsService.test.ts › Dây chuẩn: trả các dây của nhạc cụ thuộc bản nhạc, theo thứ tự hiển thị` |
| UTC-PC-014 | `src/modules/practice/service/PracticeSettingsService.test.ts › Bản nhạc không tồn tại trả 404 cho cả hai API` |

## SubmissionCompareService (UTC-CM-...)

| Sheet ID | Covered by (existing repo test) |
|---|---|
| UTC-CM-001 | `src/modules/practice/service/CompareSegmentMatcherService.test.ts › chồng lấn đúng 50% đoạn ngắn hơn thì là lỗi lặp lại` |
| UTC-CM-002 | `src/modules/practice/service/CompareSegmentMatcherService.test.ts › đoạn cũ không còn lỗi nào ở bài mới trong cùng khoảng thì là đã cải thiện` |
| UTC-CM-003 | `src/modules/practice/service/CompareSegmentMatcherService.test.ts › noSegmentsToCompare khi chỉ bài mới có lỗi` |
| UTC-CM-004 | `src/modules/practice/service/CompareSegmentMatcherService.test.ts › khác loại lỗi không khớp, và lỗi khác loại ở bài mới thì đoạn cũ không được coi là đã cải thiện` |
| UTC-CM-005 | `src/modules/practice/service/CompareSegmentMatcherService.test.ts › đoạn dài 0 được nới thành độ dài tối thiểu` |
| UTC-CM-007 | `src/modules/practice/service/PitchChartBuilderService.test.ts › Biểu đồ đặt cao độ học viên theo trục thời gian bản mẫu qua căn chỉnh DTW, giữ khoảng lặng là null` |
| UTC-CM-008 | `src/modules/practice/service/PitchChartBuilderService.test.ts › File sai định dạng, lệch số khung hoặc không có cao độ nào đều bị từ chối` |
| UTC-CM-009 | `src/modules/practice/service/PracticeResultService.test.ts › Biểu đồ cao độ: dựng từ file phân tích rồi lưu lại; lần sau dùng bản đã lưu, không gọi Rhythm` |
| UTC-CM-010 | `src/modules/practice/service/PracticeResultService.test.ts › Biểu đồ cao độ: dựng từ file phân tích rồi lưu lại; lần sau dùng bản đã lưu, không gọi Rhythm` |
| UTC-CM-012 | `src/modules/practice/service/PracticeResultService.test.ts › MSG-26: Rhythm không có file phân tích thì trả 422, các phần khác không bị ảnh hưởng` |
| UTC-CM-014 | `src/modules/practice/service/SubmissionCompareService.test.ts › đảo a và b vẫn cùng older/newer / trả đủ piece, sheetMusic, attemptNo và segments` |
| UTC-CM-015 | `src/modules/practice/service/SubmissionCompareService.test.ts › không thuộc học sinh thì 404` |
| UTC-CM-016 | `src/modules/practice/service/SubmissionCompareService.test.ts › bài chưa phân tích xong thì 409` |
| UTC-CM-017 | `src/modules/practice/service/SubmissionCompareService.test.ts › khác bản nhạc thì 400` |
| UTC-CM-018 | `src/modules/practice/service/SubmissionCompareService.test.ts › không có dữ liệu cao độ thì 422 kèm submissionId` |

## PracticeSegmentService (UTC-PG-...)

| Sheet ID | Covered by (existing repo test) |
|---|---|
| UTC-PG-001 | `src/modules/practice/service/PracticeSegmentService.test.ts › publish job có khoảng đoạn, baselineEvaluationId và callback đoạn` |
| UTC-PG-002 | `src/modules/practice/service/PracticeSegmentService.test.ts › publish_failed → attempt FAILED với SEGMENT_FAILED` |
| UTC-PG-004 | `src/modules/practice/service/PracticeSegmentService.test.ts › 404 khi submission không thuộc học sinh` |
| UTC-PG-005 | `src/modules/practice/service/PracticeSegmentService.test.ts › 409 khi submission chưa COMPLETED, thiếu evaluationId, hoặc sheetMusic null` |
| UTC-PG-006 | `src/modules/practice/service/PracticeSegmentService.test.ts › 409 khi submission chưa COMPLETED, thiếu evaluationId, hoặc sheetMusic null` |
| UTC-PG-007 | `src/modules/practice/service/PracticeSegmentService.test.ts › 400 khi đoạn rỗng hoặc ngược` |
| UTC-PG-011 | `src/modules/practice/service/PracticeSegmentService.test.ts › thời lượng lấy từ chất lượng bản thu khi chưa có pitch chart` |
| UTC-PG-012 | `src/modules/practice/service/PracticeSegmentService.test.ts › chấp nhận đoạn khi không biết thời lượng` |
| UTC-PG-013 | `src/modules/practice/service/PracticeSegmentService.test.ts › 404 khi upload không thuộc học sinh` |
| UTC-PG-016 | `src/modules/practice/service/PracticeSegmentService.test.ts › get: 404 khi không sở hữu, reconcile khi đang xử lý` |
| UTC-PG-017 | `src/modules/practice/service/PracticeSegmentService.test.ts › pitch-chart: dựng từ result.pitch, thời gian tính từ đầu đoạn` |
| UTC-PG-018 | `src/modules/practice/service/PracticeSegmentService.test.ts › pitch-chart: 404 khi không sở hữu, 409 khi đang xử lý, 422 khi thiếu dữ liệu cao độ` |
| UTC-PG-019 | `src/modules/practice/service/PracticeSegmentService.test.ts › pitch-chart: 404 khi không sở hữu, 409 khi đang xử lý, 422 khi thiếu dữ liệu cao độ` |
| UTC-PG-020 | `src/modules/practice/service/PracticeSegmentService.test.ts › pitch-chart: 404 khi không sở hữu, 409 khi đang xử lý, 422 khi thiếu dữ liệu cao độ` |
| UTC-PG-021 | `src/modules/practice/service/PracticeSegmentService.test.ts › list trả nextCursor khi còn trang` |
| UTC-PG-022 | `src/modules/practice/service/PracticeSegmentService.test.ts › list trả nextCursor khi còn trang` |
| UTC-PG-024 | `src/modules/practice/service/SegmentProgressService.test.ts › started chỉ tiến stage, không lùi` |
| UTC-PG-025 | `src/modules/practice/service/SegmentProgressService.test.ts › started chỉ tiến stage, không lùi` |
| UTC-PG-026 | `src/modules/practice/service/SegmentProgressService.test.ts › done/feedback lưu điểm, baseline và analyzedAt` |
| UTC-PG-027 | `src/modules/practice/service/SegmentProgressService.test.ts › điểm null và baseline null vẫn COMPLETED` |
| UTC-PG-029 | `src/modules/practice/service/SegmentProgressService.test.ts › rejected lưu rejectReason; failed lưu SEGMENT_FAILED, không retry` |
| UTC-PG-030 | `src/modules/practice/service/SegmentProgressService.test.ts › done/feedback lần hai trả false, không ghi lại` |
| UTC-PG-031 | `src/modules/practice/service/SegmentProgressService.test.ts › callback lệch attempt hoặc evaluationId lạ bị bỏ qua` |
| UTC-PG-032 | `src/modules/practice/service/SegmentProgressService.test.ts › reconcile áp trạng thái completed từ Rhythm khi mất callback` |
| UTC-PG-035 | `src/modules/practice/service/SegmentProgressService.test.ts › reconcile bỏ qua khi Rhythm không truy cập được hoặc job chưa publish` |

## StudentDashboardService (UTC-SD-...)

| Sheet ID | Covered by (existing repo test) |
|---|---|
| UTC-SD-013 | `src/modules/practice/service/StudentDashboardService.test.ts › Chưa nộp bài nào: số liệu rỗng, không có bài nổi bật` |
| UTC-SD-014 | `src/modules/practice/service/StudentDashboardService.test.ts › Hôm nay tính theo ngày Việt Nam; độ chính xác chỉ lấy bài đã phân tích` |
| UTC-SD-016 | `src/modules/practice/service/StudentDashboardService.test.ts › Hôm nay tính theo ngày Việt Nam; độ chính xác chỉ lấy bài đã phân tích` |
| UTC-SD-017 | `src/modules/practice/service/StudentDashboardService.test.ts › Bài nộp nhiều nhất và bài tiến bộ nhiều nhất; bỏ qua bài tập đã xóa` |
| UTC-SD-018 | `src/modules/practice/service/StudentDashboardService.test.ts › Không bài nào có điểm tăng thì không có bài tiến bộ nhất` |
| UTC-SD-020 | `src/modules/practice/service/StudentDashboardService.test.ts › Tiến bộ độc tấu và hòa tấu tách riêng, giữ 10 lần phân tích gần nhất` |
| UTC-SD-021 | `src/modules/practice/service/StudentDashboardService.test.ts › Bài nộp nhiều nhất và bài tiến bộ nhiều nhất; bỏ qua bài tập đã xóa` |

## ChallengeService (UTC-CH-...)

| Sheet ID | Covered by (existing repo test) |
|---|---|
| UTC-CH-001 | `tests/unit/ChallengeRules.test.ts › rejects a missing or too long title` |
| UTC-CH-003 | `tests/unit/ChallengeRules.test.ts › checks title and description length` |
| UTC-CH-004 | `tests/unit/ChallengeRules.test.ts › requires instrument, piece, classes and week with MSG-35` |
| UTC-CH-007 | `tests/unit/ChallengeRules.test.ts › derives the status from the clock` |
| UTC-CH-008 | `tests/unit/ChallengeRules.test.ts › requires an available piece and a ready main sheet` |
| UTC-CH-009 | `tests/unit/ChallengeRules.test.ts › detects shared ids` |
| UTC-CH-010 | `tests/unit/ChallengeWeekCalculator.test.ts › builds Monday 00:00 to Sunday 23:59:59.999 in UTC+7` |
| UTC-CH-011 | `tests/unit/ChallengeWeekCalculator.test.ts › detects Mondays` |
| UTC-CH-012 | `tests/unit/ChallengeWeekCalculator.test.ts › starts the current week at now` |
| UTC-CH-013 | `tests/unit/ChallengeWeekCalculator.test.ts › flags past weeks` |

## LeaderboardService (UTC-LD-...)

| Sheet ID | Covered by (existing repo test) |
|---|---|
| UTC-LD-001 | `tests/unit/LeaderboardMetricCalculator.test.ts › LeaderboardMetricCalculator.accuracy` |
| UTC-LD-002 | `tests/unit/LeaderboardMetricCalculator.test.ts › LeaderboardMetricCalculator.weeklyImprovement` |
| UTC-LD-003 | `tests/unit/LeaderboardMetricCalculator.test.ts › LeaderboardMetricCalculator.weeklyImprovement › week boundary follows UTC+7` |
| UTC-LD-004 | `tests/unit/LeaderboardMetricCalculator.test.ts › streaks › activityDays groups by Vietnam day and applies the minimum` |
| UTC-LD-005 | `tests/unit/LeaderboardMetricCalculator.test.ts › streaks › longestStreak` |
| UTC-LD-006 | `tests/unit/LeaderboardMetricCalculator.test.ts › streaks › currentStreak` |
| UTC-LD-007 | `tests/unit/LeaderboardMetricCalculator.test.ts › LeaderboardMetricCalculator.weeklyActivity › counts submissions in the ISO week` |
| UTC-LD-008 | `tests/unit/LeaderboardMetricCalculator.test.ts › LeaderboardMetricCalculator.confirmedBonus` |
| UTC-LD-009 | `tests/unit/LeaderboardMetricCalculator.test.ts › LeaderboardMetricCalculator.completionRate` |
| UTC-LD-010 | `tests/unit/LeaderboardMetricCalculator.test.ts › LeaderboardMetricCalculator.hasActivity` |
| UTC-LD-011 | `tests/unit/LeaderboardRankingCalculator.test.ts › normalize › scales min-max to 0-100` |
| UTC-LD-012 | `tests/unit/LeaderboardRankingCalculator.test.ts › overallScores › averages the normalised criteria and rounds to one decimal` |
| UTC-LD-014 | `tests/unit/LeaderboardRankingCalculator.test.ts › rank › ties are ordered by studentCode ascending, null last, then studentId` |
| UTC-LD-015 | `tests/unit/LeaderboardRankingCalculator.test.ts › rank › ascending direction` |

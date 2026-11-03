# UC-01: Thử lại khi phân tích bản thu thất bại

## Luồng submit đã kiểm tra

1. `PracticeDemoContext.submit` tải bản thu qua `audioAnalysisApi.upload` để lấy `fileId`.
2. Frontend gửi `sheetMusicId`, `studentUploadId` và ngữ cảnh bài tập tới `POST /api/v1/practice/submissions`.
3. Backend xác thực quyền sở hữu file, bản nhạc và liên kết bài tập; tạo một Submission PROCESSING rồi gửi job tới RabbitMQ.
4. Rhythm chạy kiểm tra chất lượng, phân tích audio, so sánh, tạo nhận xét AI; gửi callback về backend.
5. `ProcessingPage` đọc trạng thái định kỳ; backend đối soát với Rhythm nếu callback bị mất. COMPLETED mở màn kết quả; FAILED cho phép thử lại.

## Phần có sẵn và điểm thiếu

Đã có màn hình thử lại, API retry theo chủ sở hữu, bộ đếm và thời gian chờ. Trước thay đổi, backend gọi endpoint retry chưa tồn tại ở Rhythm rồi gửi lại cùng evaluationId; phản hồi Rhythm thiếu attempt khiến kết quả sau retry không được đối soát. Gemini lỗi hoặc timeout bị đổi thành nhận xét dự phòng và bản nộp vẫn COMPLETED.

## Thiết kế và thay đổi

- Giữ nguyên Submission, studentUploadId, fileUrl và liên kết bài tập. Không tải lại file hay tạo thêm bản nộp.
- Dùng evaluationId và messageId mới cho mỗi lần thử; tăng attempt và retryCount bằng cập nhật có điều kiện để tránh hai yêu cầu cùng nhận một lượt.
- Gửi lại pipeline từ QUALITY_CHECK qua queue hiện có. Rhythm chưa có checkpoint từng bước, nên đây là chạy lại toàn bộ phân tích; chưa triển khai tiếp tục từ đúng bước lỗi như mục tiêu GBR-63.
- Đối soát bằng evaluationId riêng của lượt hiện tại; nếu Rhythm có attempt thì vẫn kiểm tra attempt. Callback cũ không còn trỏ tới bản nộp hiện tại.
- Gemini đã cấu hình nhưng lỗi, timeout hoặc trả nội dung rỗng sẽ phát AI_FEEDBACK_FAILED / AI_FEEDBACK_TIMEOUT. Worker lưu FAILED và gửi callback để học viên chủ động thử lại. Không cộng thêm lượt retry tự động của queue cho lỗi Gemini.
- Khi không cấu hình Gemini, giữ hành vi nhận xét dự phòng vốn có để môi trường không tích hợp AI vẫn sử dụng được.
- Màn hình hiển thị lý do lỗi và trạng thái đang gửi yêu cầu thử lại.

## Chính sách hiện có và giới hạn

- Tối đa 3 lần thử lại; chờ 5 giây trước lần đầu, 10 giây trước các lần tiếp theo.
- File được giữ trong các lượt còn được phép thử lại. Theo GBR-62 hiện có, sau lần cuối thất bại file máy chủ bị xóa. Tải file dự phòng trên giao diện phụ thuộc File đang giữ trong bộ nhớ trình duyệt, không tồn tại sau reload. Yêu cầu giữ file vô thời hạn cần thay đổi chính sách này riêng.
- Không thêm thời hạn tùy ý cho toàn pipeline: job đang chờ queue, worker mất kết nối hoặc publish_unknown chưa được tự đổi thành FAILED chỉ vì chạy lâu. Timeout Gemini dùng cấu hình gemini_timeout_seconds hiện có; lỗi tải/giải mã tiếp tục theo cơ chế cũ.
- Không thay đổi schema hay tạo migration. Cần cập nhật đồng thời backend, Rhythm Service và frontend.

## Kiểm chứng

Các kiểm thử bao phủ giữ file và Submission khi retry, mã xử lý mới, đối soát lượt mới khi thiếu attempt, bỏ qua kết quả cũ, lỗi/timeout/nội dung rỗng của Gemini, callback FAILED và phục hồi thành công bằng cùng URL bản thu. Không gọi Gemini, RabbitMQ hay database triển khai thật.

Kết quả chạy: 21 kiểm thử backend, 46 kiểm thử Rhythm và 6 kiểm thử trạng thái frontend đều đạt. Kiểm tra TypeScript backend và frontend đạt. Nhóm frontend chạy với `--environment node` vì môi trường jsdom hiện có lỗi khởi động trong dependency undici. Chưa kiểm thử giao diện trong trình duyệt hoặc gọi dịch vụ AI thật.

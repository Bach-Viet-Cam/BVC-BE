# Test phân tích audio

## Cấu hình và chuẩn bị

1. Cập nhật DB theo `prisma/schema.prisma` bằng quy trình quản lý schema của dự án. Có hai bảng mới: `audio_uploads` và `audio_evaluation_requests`. Không có file migration mới trong thay đổi này. Chạy `npx prisma generate` để sinh client.
2. Thêm các biến dưới đây vào .env local theo .env.example; không commit .env:

```dotenv
FILE_STORAGE_PROVIDER=local
FILE_STORAGE_LOCAL_ROOT=uploads
FILE_STORAGE_PUBLIC_BASE_URL=https://your-public-backend.example.com
RABBITMQ_URL=amqps://user:password@your-rabbitmq-host/vhost
RHYTHM_SERVICE_BASE_URL=http://localhost:8001
RHYTHM_SERVICE_INTERNAL_API_KEY=<cùng giá trị với Rhythm Service>
```

FILE_STORAGE_PUBLIC_BASE_URL là origin của BE, không kèm /uploads; URL tạo ra có dạng /uploads/audio/<uuid>.wav. Root có thể tuyệt đối hoặc tương đối với thư mục chạy BE. Chỉ hỗ trợ provider local ở bản đầu; provider lạ báo lỗi lúc khởi động. File cũ không tự chuyển vị trí khi đổi root/provider.

Worker cho phép localhost và IP nội bộ. FILE_STORAGE_PUBLIC_BASE_URL phải là địa chỉ BE mà worker truy cập được, trả trực tiếp audio và không redirect hoặc có trang xác nhận trung gian. Nếu cấu hình RHYTHM_SERVICE_ALLOWED_HOSTS, thêm hostname của BE vào danh sách này. Khi chạy trong Docker, localhost trỏ đến chính container đang thực hiện request; dùng hostname hoặc địa chỉ phù hợp để kết nối giữa các service.

## Chạy thử

- Chạy BE, API Rhythm, worker Rhythm và FE. Dùng cùng RabbitMQ/vhost và internal key ở hai service.
- Đăng nhập rồi mở `/dev/audio-analysis` hoặc dùng mục Phân tích audio thử nghiệm trong Dev Navigator.
- Chọn hai WAV/MP3 tối đa 25 MiB mỗi file. File upload ngay; nút So sánh chỉ bật khi cả hai URL sẵn sàng.
- Bấm So sánh. FE gửi JSON chỉ chứa templateUrl và studentUrl. Job luôn dùng instrumentId=dan_bau.
- FE hỏi BE mỗi 3 giây, dừng khi có kết quả/lỗi cuối cùng. Sau 5 phút có thể tiếp tục kiểm tra; refresh cùng tab khôi phục evaluationId.
- Nếu trạng thái gửi chưa xác định, kiểm tra cùng evaluationId; không tự gửi lại job.

## API

- POST /api/v1/audio-uploads: Bearer access token, multipart đúng một field file. Trả 201 và data.fileId/data.url.
- POST /api/v1/audio-evaluations: Bearer access token, JSON hai URL do người dùng đã upload. Trả 202 và evaluationId/status=queued sau publisher confirm.
- GET /api/v1/audio-evaluations/:evaluationId: chỉ chủ yêu cầu đọc được. Rhythm 404 trước khi worker nhận được chuyển thành queued nếu publish đã được xác nhận.
- Lỗi publish có data.evaluationId/data.status nếu đã tạo yêu cầu, để tiếp tục kiểm tra. Internal key không nằm trong response FE.

Static URL cho phép người có URL nghe/tải file; quyền sở hữu được kiểm tra ở API tạo và tra cứu phân tích.

## Dọn file chưa sử dụng

Chạy `npm run audio:cleanup` để dọn tối đa 100 upload quá 24 giờ chưa có evaluation tham chiếu. Có thể lên lịch chạy lệnh này. Metadata được claim trước khi xóa, dùng cùng khóa transaction với tạo evaluation để tránh xóa file vừa được sử dụng. File được evaluation tham chiếu được giữ lại trong bản test. File tạm được dọn sau request.

## Kiểm tra

Backend: npm test, npm run lint, npm run typecheck. Frontend: npm run build, npm run lint.

Test HTTP tự động dùng DB/publisher/Rhythm giả tại ranh giới tích hợp, còn multipart upload, storage local, static route, validation, controller và service chạy thật. Test này không thay thế test với RabbitMQ, PostgreSQL và worker thật.

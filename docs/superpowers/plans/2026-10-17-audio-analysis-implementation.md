# Kế hoạch triển khai phân tích audio

Người dùng đã duyệt spec và cho phép tự lập kế hoạch vì thiếu skill writing-plans.

1. Thêm schema metadata upload và yêu cầu phân tích; chỉ sửa Prisma schema, không tạo migration.
2. Thêm storage abstract/local/factory; đọc provider, local root và URL public qua EnvConfig; mount audio riêng để giữ upload ensemble.
3. Thêm upload WAV/MP3, giới hạn 25 MiB, xác minh nội dung, lưu metadata và dọn file tạm.
4. Thêm publisher RabbitMQ có confirm/mandatory, giữ trạng thái publish chưa xác định; job luôn dùng dan_bau.
5. Thêm API truy vấn Rhythm qua server, kiểm tra owner, xử lý 404 trước worker và lỗi tạm thời.
6. Thêm route FE, hai upload slot, lưu URL, so sánh và polling có timeout/backoff/khôi phục khi refresh.
7. Thêm cleanup file chưa dùng có cơ chế claim phối hợp với tạo evaluation.
8. Chạy kiểm tra schema, typecheck, lint, test và build; ghi rõ phần E2E cần DB/queue/worker và URL public.

Không tự commit. Không sửa .env thật. Không tạo bảng mapping nhạc cụ hoặc feature flag.

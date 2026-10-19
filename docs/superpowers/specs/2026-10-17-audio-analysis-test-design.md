# Thiết kế route thử nghiệm phân tích audio

Ngày: 2026-10-17
Trạng thái: Người dùng đã duyệt hướng thiết kế; tài liệu chờ rà soát trước kế hoạch triển khai chi tiết.

## 1. Mục tiêu và phạm vi

Tạo route FE `/dev/audio-analysis` để chọn audio mẫu và bài nộp học sinh, gửi job RabbitMQ, rồi xem kết quả thật từ Rhythm Service.

Chọn file sẽ upload ngay tới BE. FE giữ URL trả về trong state. Khi bấm So sánh, FE chỉ gửi JSON chứa hai URL; nhạc cụ được BE cố định là dan_bau; không upload lại file và không giữ kết nối chờ worker hoàn tất.

Phạm vi gồm storage abstraction, lưu local, static route, metadata upload, bản ghi yêu cầu phân tích, publisher, API trạng thái và giao diện test. Chưa tích hợp assignment/submission, storage bên thứ ba, SSE, WebSocket hoặc sửa thuật toán Rhythm.

## 2. Hiện trạng và các quyết định

- BE dùng Express, TypeScript, Prisma, Zod, Multer; đăng ký API từ src/routes/index.ts và public thư mục uploads qua /uploads.
- UploadMiddleware hiện dành cho một recording; cần middleware riêng cho audio test, không đổi hành vi ensemble.
- FE dùng React Router và Axios; AnalysisPage hiện dùng dữ liệu mẫu. Tái sử dụng ScoreRing/ScoreBar nhưng tạo trang test riêng.
- BE chưa có dependency AMQP trong package.json; cần bổ sung publisher.
- Submission bắt buộc liên kết assignment; dùng bảng yêu cầu riêng cho route test.
- Polling qua BE là phương án được chọn. SSE cần thêm quản lý kết nối; WebSocket vượt nhu cầu thử nghiệm.
- Mỗi file mới của BE theo AGENTS.md và coding-convention: một class export/file, TypeScript, tên PascalCase có suffix layer. Middleware theo ngoại lệ hiện có. Không refactor module ngoài phạm vi.

## 3. Storage contract

FileStorageService là abstract class, dùng instance methods để implementation kế thừa:

- save({ sourcePath, originalName, contentType, namespace }): Promise<{ key, sizeBytes, contentType }>.
- delete(key): Promise<void>; gọi lặp với file đã mất không gây lỗi nghiệp vụ.
- getDownloadUrl(key): Promise<string>.

LocalFileStorageService extends FileStorageService. Class này lưu file bằng UUID vào thư mục gốc lấy từ FILE_STORAGE_LOCAL_ROOT (mặc định uploads), xác minh đường dẫn nằm trong thư mục đó, và tạo URL từ public base URL cấu hình. Không dùng Host header của request để tạo URL.

Ví dụ key: audio/<uuid>.wav. Ví dụ file: uploads/audio/<uuid>.wav. Ví dụ URL: https://be.example.com/uploads/audio/<uuid>.wav.

FileStorageFactory chọn implementation theo FILE_STORAGE_PROVIDER (mặc định local) và truyền qua kiểu FileStorageService. Phiên bản đầu chỉ triển khai LocalFileStorageService; provider chưa hỗ trợ phải báo lỗi cấu hình khi khởi động, không âm thầm fallback. Sau này thêm class cho storage bên thứ ba và đăng ký trong factory; khi đã hỗ trợ thì đổi provider qua env. FILE_STORAGE_LOCAL_ROOT chỉ áp dụng cho local; hỗ trợ đường dẫn tuyệt đối hoặc tương đối với working directory của BE. Chuẩn hóa bằng path.resolve một lần khi khởi động. LocalFileStorageService và static route /uploads dùng cùng đường dẫn tuyệt đối đã chuẩn hóa, kể cả khi thư mục gốc khác uploads. Dùng mount /uploads cố định trong Constant. Chỉ mount static storage này khi provider là local; giữ hành vi các upload hiện có của ensemble.

DB lưu provider và key; URL phục vụ API được tạo qua implementation tương ứng. getDownloadUrl là async để hỗ trợ signed URL sau này; adapter mới phải tạo URL đủ hạn cho thời gian chờ queue và retry.

Multer nhận file vào thư mục tạm riêng, storage chuyển sang thư mục chính. Dọn file tạm sau thành công hoặc thất bại. Nếu lưu metadata thất bại sau khi lưu file, thực hiện dọn file đã lưu và ghi log nếu dọn thất bại.

## 4. Upload ngay khi chọn file

POST /api/v1/audio-uploads
- Yêu cầu đăng nhập; route được đăng ký trực tiếp, không dùng feature flag.
- multipart/form-data, đúng một trường file tên file.
- Phiên bản đầu hỗ trợ WAV, MP3; xác minh extension, MIME phù hợp và chữ ký nội dung, không chỉ tin tên file. File có container hợp lệ nhưng audio hỏng vẫn có thể bị worker từ chối.
- Giới hạn 25 MiB/file, đồng bộ giới hạn worker; từ chối file rỗng, thiếu file, thừa file.
- Xác thực trước middleware upload.
- Trả 201 qua ApiResponse: { success: true, data: { fileId, url }, message: "" }.

AudioUpload metadata gồm id, ownerId, provider, key, originalName, contentType, sizeBytes, createdAt. Provider/key có unique constraint. Không nhận filesystem path từ client.

FE có hai upload slot độc lập. Mỗi slot giữ file, trạng thái, lỗi, fileId và URL. Chọn file mới sẽ vô hiệu hóa URL đang dùng cho so sánh trong lúc upload. Chỉ response của lần chọn mới nhất được cập nhật state; hủy hoặc bỏ qua response upload cũ.

Có tên file, dung lượng, nghe thử và thử upload lại. Thu hồi object URL khi đổi file hoặc unmount. Gửi FormData với multipart boundary do trình duyệt tạo; bỏ Content-Type application/json mặc định cho request này. Tăng timeout upload riêng lên 120 giây, giữ timeout request thông thường.

## 5. Tạo yêu cầu so sánh

POST /api/v1/audio-evaluations
Body: { templateUrl: string, studentUrl: string }. FE không gửi trường instrumentId.

BE luôn gán instrumentId trong job bằng chuỗi dan_bau qua Constant của module. Không truy vấn Instrument, không tạo bảng mapping, không chuyển đổi UUID sang code. FE không có ô chọn nhạc cụ; có thể hiển thị nhãn Đàn bầu cố định. Muốn đổi nhạc cụ sau này thì sửa Constant trong code.

BE đối chiếu URL với metadata của file thuộc người dùng hiện tại. Chỉ nhận URL chính xác do storage cung cấp, không nhận URL tùy ý hoặc suy ra đường dẫn local từ URL client. Phiên bản local đối chiếu origin, base path và key đã lưu; key phải resolve về metadata hợp lệ. Đây là quyền sử dụng trong API; static URL là bearer URL tải công khai, không yêu cầu cookie/token đăng nhập.

BE sinh evaluationId và messageId bằng UUID, lưu yêu cầu rồi publish JSON UTF-8 vào queue rhythm.evaluate.v1:
{ messageId, evaluationId, templateUrl, studentUrl, instrumentId: "dan_bau", requestedAt: ISO8601 }.

messageId và evaluationId dài 1–128 ký tự. Chỉ trả 202 sau khi nhận publisher confirm, không chờ worker. Response: { success: true, data: { evaluationId, status: "queued" }, message: "" }.

Publisher dùng persistent message, application/json, mandatory routing và xử lý message bị trả lại. Queue durable với x-dead-letter-exchange rỗng và x-dead-letter-routing-key rhythm.evaluate.dlq, khớp chính xác worker. Confirm không thay thế kiểm tra routing. Dùng kết nối tái sử dụng, tái kết nối có giới hạn và đóng kết nối khi shutdown.

AudioEvaluationRequest gồm evaluationId, messageId, ownerId, templateUploadId, studentUploadId, instrumentCode, publicationState, createdAt, publishedAt, lastErrorCode. instrumentCode luôn lưu dan_bau để biết cấu hình đã dùng cho từng yêu cầu; đây là trường dữ liệu của yêu cầu, không phải bảng mapping.

publicationState: publishing, published, publish_failed, publish_unknown. Nếu chắc chắn broker chưa nhận thì publish_failed; nếu timeout/mất kết nối sau khi gửi thì publish_unknown. Trả lỗi tạo yêu cầu kèm evaluationId qua cơ chế lỗi chung khi đã có bản ghi; FE lưu ID và không tự POST lại. Với publish_unknown, cho kiểm tra lại cùng ID và giữ file để đối soát; không tự tạo hoặc publish lại job. Endpoint kiểm tra sẽ truy vấn Rhythm trước, kết quả tồn tại được ưu tiên hơn trạng thái publish local.

Không hứa exactly-once giữa PostgreSQL và RabbitMQ. Outbox/replay tự động là hướng mở rộng; bản test giữ trạng thái trung gian để không báo thành công sai hoặc gửi trùng khi outcome chưa rõ.

## 6. API trạng thái

GET /api/v1/audio-evaluations/:evaluationId

Xác thực và kiểm tra owner trước khi gọi Rhythm. ID không tồn tại hoặc không thuộc người dùng trả 404. Không truy vấn DB riêng của Rhythm.

BE gọi GET {RHYTHM_SERVICE_BASE_URL}/api/v1/evaluations/{evaluationId} với Bearer RHYTHM_SERVICE_INTERNAL_API_KEY, timeout 10 giây. Internal key chỉ nằm ở server.

Response thành công dùng wrapper hiện có, data gồm evaluationId, status, result, error. Rhythm có queued, processing, completed, failed; BE có thêm publishing, publish_failed, publish_unknown cho trạng thái gửi.

- Rhythm trả 200: kiểm tra schema response và trả trạng thái thực; không đánh dấu hoàn tất chỉ vì HTTP 200.
- Rhythm trả 404, local published: trả queued, result/error null. Worker tạo bản ghi khi nhận job nên 404 ban đầu là bình thường.
- Rhythm trả 404, local publishing/publish_failed/publish_unknown: trả trạng thái gửi tương ứng; không giả là worker failed.
- Rhythm timeout hoặc lỗi mạng/5xx: trả lỗi dịch vụ tạm thời qua ErrorMiddleware; không ghi job failed.
- Rhythm 401/403: lỗi cấu hình tích hợp phía server; không chuyển thành lỗi đăng nhập FE.
- Rhythm trả failed: trả error code/message đã chuẩn hóa, không trả stack trace.

Chỉ hiển thị dữ liệu có thật: overallScore, pitchAccuracyPercent, rhythmAccuracyPercent, aiFeedback. Không tự tạo tempo, kỹ thuật hoặc vị trí lỗi từ trang mock.

## 7. FE route và polling

Route /dev/audio-analysis nằm trong ProtectedRoute và được đăng ký trực tiếp cho người dùng đã đăng nhập. BE đăng ký trực tiếp hai nhóm endpoint upload/evaluation, không dùng feature flag. Thêm lối truy cập trong DevNav theo cơ chế hiển thị sẵn có của component. Khi cần đổi hoặc gỡ route thì sửa code.

Nút So sánh chỉ bật khi hai URL hợp lệ, không còn upload. Khóa gửi trong lúc POST. Sau khi đã nhận evaluationId, người dùng có thể kiểm tra lại ID thay vì gửi lại.

Polling mỗi 3 giây sau khi request trước đã xong, không dùng interval gây chồng request. Dừng khi completed, failed hoặc publish_failed; publish_unknown tiếp tục kiểm tra nhưng hiển thị trạng thái chưa xác định rõ ràng. Hủy polling khi unmount hoặc chuyển sang yêu cầu mới.

Lỗi mạng polling dùng backoff 3, 6, 12, tối đa 15 giây; response thành công đặt lại nhịp 3 giây. Dừng chờ tự động sau 5 phút và hiện Tiếp tục kiểm tra; đây là timeout giao diện, không thay đổi trạng thái worker. Không hiển thị phần trăm tiến độ xử lý giả.

Lưu evaluationId trong sessionStorage theo user ID để refresh cùng tab tiếp tục kiểm tra, xóa khi logout. URL upload ở state có thể mất khi refresh; phiên bản đầu không khôi phục form chưa gửi và không cần lưu File vào browser storage.

## 8. Mạng, cấu hình và vòng đời file

BE dùng FILE_STORAGE_PROVIDER=local, FILE_STORAGE_LOCAL_ROOT=uploads, FILE_STORAGE_PUBLIC_BASE_URL, RABBITMQ_URL, RHYTHM_SERVICE_BASE_URL, RHYTHM_SERVICE_INTERNAL_API_KEY. EnvConfig chuẩn hóa provider bằng trim/lowercase, dùng local khi không khai báo; root mặc định uploads khi không khai báo, giá trị rỗng hoặc chỉ khoảng trắng phải báo lỗi cấu hình. Provider không được factory hỗ trợ phải báo lỗi ngay. Giữ public base URL để tạo URL tuyệt đối mà worker tải được. Không thêm VITE_AUDIO_ANALYSIS_TEST_ENABLED hay AUDIO_ANALYSIS_TEST_ENABLED. Route và nhạc cụ dan_bau vẫn chọn trực tiếp trong code. Provider lưu trong metadata phản ánh implementation thực tế; thay provider không tự di chuyển file cũ. Queue và các giới hạn dùng Constant của module; toàn bộ env BE được đọc qua EnvConfig. Cập nhật .env.example và tài liệu convention, không sửa/commit .env thật.

Worker hiện kiểm tra hostname và từ chối loopback/private IP ngay cả trong allowed_hosts. Public static trên localhost chưa đủ. Trước E2E, cần domain hoặc HTTPS tunnel trỏ tới BE, không có trang xác nhận trung gian, URL trả trực tiếp audio và không redirect. Rhythm chạy container thì localhost:8001 cũng phải thay bằng địa chỉ API đúng từ góc nhìn Express. Không nới cơ chế chặn private IP trong phạm vi này.

Thêm tác vụ cleanup chạy độc lập qua script có thể lên lịch: upload chưa được yêu cầu nào tham chiếu được dọn sau 24 giờ; file tham chiếu bởi evaluation được giữ trong phiên bản test, không tự xóa khi worker có thể còn xử lý. Cleanup phải kiểm tra lại tham chiếu trong transaction/khóa trước khi xóa và phối hợp với thao tác tạo evaluation để tránh xóa file vừa được sử dụng. Chính sách xóa file đã dùng và lưu kết quả dài hạn thuộc bước production sau.

## 9. Thứ tự triển khai và nghiệm thu

1. Contract và storage: thêm metadata upload, abstract class, local implementation, factory theo FILE_STORAGE_PROVIDER, root theo FILE_STORAGE_LOCAL_ROOT, cấu hình URL public, middleware và POST upload. Nghiệm thu: chọn từng file thì upload ngay, nhận URL, URL tải được từ môi trường worker.
2. Publisher và yêu cầu: thêm bảng yêu cầu, Constant cố định instrumentId=dan_bau, kiểm tra URL/owner, publisher confirms, POST evaluation. Nghiệm thu: JSON đúng contract, hai file không upload lại, chỉ 202 khi broker nhận và routing thành công.
3. API trạng thái: client nội bộ và GET có ownership. Nghiệm thu: 404 ban đầu thành queued; phân biệt worker failed, lỗi mạng và publish_unknown; internal key không ra FE.
4. FE: trang test, upload slot, API và hook polling theo feature practice. Nghiệm thu: nhận kết quả thật, refresh tiếp tục chờ, xử lý đổi file nhanh và dừng polling đúng lúc.
5. Cleanup và E2E: kiểm tra file bỏ dở, broker lỗi, download lỗi, timeout, quyền sở hữu và luồng thành công với worker thật. Chạy typecheck/lint/build và test phù hợp từng repo; không yêu cầu kiểm thử tải lớn cho route test.

## 10. Kiểm thử trọng tâm

- Storage: factory chọn local theo env và từ chối provider lạ; root mặc định/tùy chỉnh/tuyệt đối/tương đối; static route và storage trỏ cùng root; không ảnh hưởng upload ensemble. Kiểm tra tạo URL/key, không traversal, UUID không trùng, xóa lặp và dọn file tạm khi lỗi.
- Upload: thiếu/thừa/rỗng/sai nội dung/quá 25 MiB, request chưa đăng nhập không lưu file.
- Evaluation: URL ngoài storage hoặc của user khác bị từ chối; request FE không cần nhạc cụ; mọi job dùng đúng instrumentId=dan_bau và không truy vấn bảng Instrument hoặc bảng mapping.
- Queue: đúng queue arguments, persistent payload, confirm, unroutable và timeout outcome không rõ; không trả 202 sai.
- Status: 404 trước worker, completed/failed thật, upstream auth lỗi không kích hoạt logout FE, key không xuất hiện trong response/log.
- FE: hai slot độc lập, response upload cũ không ghi đè file mới, không gửi so sánh khi upload dở, không polling chồng, cleanup khi unmount, refresh dùng lại evaluationId.
- E2E: hai WAV/MP3 tải được qua HTTPS, job được worker nhận, cùng evaluationId trả kết quả và FE hiển thị bốn trường thật.

## 11. Rà soát tài liệu

Đã kiểm tra sự nhất quán giữa upload trước và so sánh bằng URL, abstract storage và local static, request FE chỉ có hai URL và instrumentId=dan_bau cố định trong job, trạng thái publish và trạng thái worker, cùng điều kiện URL public. Không có thay đổi code sản phẩm trong bước thiết kế này. Bước kế tiếp là người dùng rà soát spec, sau đó mới lập implementation plan theo skill writing-plans nếu có.

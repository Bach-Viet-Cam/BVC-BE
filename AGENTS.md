# Backend instructions

Before changing backend code, read and follow:

- `.agents/rules/coding-convention.md`

Use the existing app wiring and module patterns as the source of truth. New backend
source files must use TypeScript and export exactly one class whose methods contain the
file's behavior, except middleware files and `App.ts`/`Server.ts`, which may export
named functions. Backend modules must be organized into the prescribed layer folders and use
PascalCase filenames with layer suffixes, including constants and DTOs.

## Quy tắc bắt buộc

- Không tự ý thực hiện commit khi viết hoặc sửa mã, cũng như khi viết hoặc cập nhật tài liệu cho tính năng. Chỉ thực hiện commit khi người dùng yêu cầu rõ ràng.
- Không tạo file migration. Khi cần thay đổi cấu trúc cơ sở dữ liệu, chỉ sửa schema Prisma.
- Tất cả các message phải sử dụng tiếng Việt có dấu đầy đủ.

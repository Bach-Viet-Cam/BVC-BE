# M03 · Roadmap API (sub-project 2, FR-M03.02.01)

Base path: `/api/v1`. All endpoints need `Authorization: Bearer <accessToken>`.
Envelope and error format are the same as `m03-classes.md` (`errors[]` = `{ field, code?, message }`).

A roadmap belongs to an **instrument**. Every save creates a new **immutable version**.
A class is pinned to one version:
- on create, it takes the latest version of its instrument;
- on an instrument change before the class starts, it takes the latest version of the new instrument, or `null`;
- if an instrument gets its first version, every ACTIVE class of that instrument with no roadmap is pinned to it (backfill).

## Admin (role `3` System Admin only — others get `403`)

### `GET /admin/roadmaps`
Active instruments with their latest version.
```json
[{ "instrument": { "id", "name": "Đàn tranh" }, "latestVersion": { "version": 2, "createdAt": "2026-10-16T03:12:00.000Z" } },
 { "instrument": { "id", "name": "Tỳ bà" }, "latestVersion": null }]
```

### `GET /admin/roadmaps/:instrumentId`
Latest version, or the standard framework when the instrument has none yet. The framework is not stored until it is saved.
```json
{ "id": null, "instrument": { "id", "name" }, "version": null, "isTemplate": true, "createdAt": null,
  "weeks": [{ "weekNumber": 1, "title": "Làm quen nhạc cụ & kỹ thuật cơ bản", "content": "", "exercises": [] }, …] }
```
`exercises[]` = `{ pieceId, title, isAvailable }`. `isAvailable: false` means the piece was hidden from the library after it was added (MSG-48).
Unknown or inactive instrument → 404.

### `GET /admin/roadmaps/:instrumentId/exercises?q=`
Visible `FINGER_EXERCISE` pieces of that instrument. `q` (≤ 100) filters by title, case-insensitive.
→ `[{ id, title, defaultBpm }]`. *(TODO(M02): served from the minimal `pieces` table.)*

### `POST /admin/roadmaps/:instrumentId/versions` → 201
```json
{ "weeks": [{ "weekNumber": 1, "title": "…", "content": "…", "exerciseIds": ["<piece uuid>", …] }, … 6 weeks] }
```
Rules:
- exactly 6 weeks, numbered 1–6;
- title 1–100 and content 1–1000 characters after trim;
- at most 50 exercises per week, no duplicates inside a week;
- each exercise must be a visible `FINGER_EXERCISE` of the same instrument.

The exercise order is kept as sent. Response: the new version, message "Lưu lộ trình thành công."

Errors (400, all collected at once):
```json
{ "success": false, "message": "Kiểm tra lại dữ liệu gửi đi", "errors": [
  { "field": "weeks.1.title", "code": "MSG-35", "message": "Tiêu đề tuần 1 không được để trống." },
  { "field": "weeks.2.content", "code": "MSG-37", "message": "Nội dung học tập tuần 2 không được vượt quá 1000 ký tự." },
  { "field": "weeks.4.exerciseIds", "code": "MSG-48", "message": "Bài luyện ngón đã chọn không còn khả dụng trong thư viện. Vui lòng chọn mục khác." },
  { "field": "weeks", "message": "Lộ trình phải có đủ 6 tuần." } ] }
```
Two saves at the same time → 409 "Không thể lưu lộ trình vì vừa có phiên bản mới. Vui lòng tải lại."

## Class roadmap (read-only)

### `GET /classes/:id/roadmap`
Allowed for the lecturer who owns the class (role `2`), or a student (role `1`) with an **active** membership.
Anyone else gets 404, so the class's existence is not leaked; the admin gets 403.
```json
{ "roadmap": { "id", "version": 1, "weeks": [
  { "weekNumber": 1, "title", "content", "startDate": "2026-09-01", "endDate": "2026-09-07",
    "status": "PAST | CURRENT | UPCOMING", "exercises": [{ "pieceId", "title", "isAvailable" }], "assignments": [] } ] } }
```
- Week k runs from `start + 7(k−1)` to `start + 7k − 1`.
- The status is computed from today in Asia/Ho_Chi_Minh.
- Class with no pinned version → `{ "roadmap": null }`.
- `assignments` is filled by sub-project 3.

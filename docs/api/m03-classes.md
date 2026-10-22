# M03 · Classes & Members API (sub-project 1)

Base path: `/api/v1`. All endpoints need `Authorization: Bearer <accessToken>`.
Class endpoints are **lecturer-only** (role `2`); other roles get `403`.

Response envelope (success): `{ "success": true, "data": …, "message": "" }`
Error envelope: `{ "success": false, "message": "…", "code"?: "MSG-xx", "errors"?: [{ "field", "code"?, "message" }] }`

| Status | Meaning |
|---|---|
| 400 | Validation error (`errors[]` per field: MSG-35 blank, MSG-37 too long, …) or bad import file (MSG-13 / MSG-14 / MSG-08) |
| 401 | Missing/invalid token, or locked account |
| 403 | Wrong role |
| 404 | Class/member/import log not found **or not owned by the caller** (ownership is never leaked) |
| 409 | Duplicate class name in cohort (MSG-05), write on a finished class (MSG-08), locked field after start (GBR-36), member conflict, import already processed |

Dates are `yyyy-MM-dd` calendar dates evaluated in Asia/Ho_Chi_Minh. Timestamps are ISO-8601 UTC.

## Instruments

### `GET /instruments?active=true|false`
Any authenticated user. Default `active=true`. → `[{ id, name, isActive }]`. *(TODO(M06): catalogue management.)*

## Classes (UC-09, FR-M03.01.01)

### `GET /classes`
Query: `q` (≤ 100, name contains, case-insensitive), `cohort`, `instrumentId`, `status=ACTIVE|FINISHED|ALL` (default `ACTIVE`), `page` (default 1), `limit` (default 20, max 200).

```json
{ "items": [ { "id", "name", "cohort", "status", "instrument": { "id", "name" }, "startDate", "endDate", "memberCount" } ],
  "pagination": { "page": 1, "limit": 20, "total": 2 },
  "activeCount": 2,
  "cohorts": ["FA26", "SP26"] }
```

### `GET /classes/semesters`
Semesters from system config `class.semesters` (JSON `[{ name, startDate, endDate }]`, edited by System Admin), sorted by `startDate`.
`{ "items": [ { "name", "startDate", "endDate" } ], "defaultName": "FA26" | null }`, where the default is the semester containing today (UTC+7), else the one whose `endDate` is closest to today.

### `POST /classes` → 201
Body: `{ name* (Mã lớp, 1–100), cohort* (Học kỳ: a semester name from `/classes/semesters`), instrumentId* (Môn học: active instrument), description (≤ 500) }`.
`startDate`/`endDate` are copied from the semester; past semesters are allowed. Unknown semester → 400 on `cohort`. Duplicate name in the semester → 409 "Mã lớp đã tồn tại.". Returns the class detail. Message: "Tạo lớp thành công."

### `GET /classes/:id`
Class detail = summary + `{ description, hasStarted, isReadOnly, endedAt }`.

### `PATCH /classes/:id`
Any subset of the create fields. Once `hasStarted` (today ≥ startDate, UTC+7), changing `instrumentId` or `cohort` (semester) → 409 with a field error (GBR-36). Finished class → 409 (GBR-37).

### `POST /classes/:id/end`
Sets `status = FINISHED`. The class becomes read-only; every write on it then returns 409 `MSG-08`.

## Members (UC-10, FR-M03.01.02 / 01.04)

### `GET /classes/:id/members`
Query: `q` (≤ 100, name or student code), `accountStatus=ALL|ACTIVE|PENDING`, `page`, `limit`.
→ `{ items: [{ studentId, fullName, studentCode, email, accountStatus, joinedAt }], pagination, totalMembers }`
(`pagination.total` = filtered count "x", `totalMembers` = all active members "n" for "Hiện x / n sinh viên").

### `POST /classes/:id/members` → 201
Body: `{ studentCode*, fullName*, email* }`. Same rules as an import row. Unknown email → new **Pending** student account.

### `DELETE /classes/:id/members/:studentId`
Soft removal (GBR-39): membership gets `removedAt`; submissions/evaluations are kept. Adding the student again creates a new active membership.

## Import (UC-10)

### `GET /classes/import-template`
Downloads `mau-danh-sach-sinh-vien.xlsx` with columns **Mã sinh viên, Họ tên, Email**.

### `POST /classes/:id/imports` (multipart, field `file`) → 201
`.xlsx` or `.csv` (UTF-8, `,` or `;`), ≤ 2 MB, ≤ 200 data rows. Header row 1; English headers (`Student Code`, `Full Name`, `Email`) are also accepted.
Creates a Student Import Log in `PREVIEW`.

```json
{ "logId", "fileName", "status": "PREVIEW", "totalRows": 34, "validRows": 31, "errorRows": 3,
  "rows": [ { "rowNumber": 2, "studentCode", "fullName", "email", "isValid": true, "reason": null } ] }
```
Row reasons: `Thiếu mã sinh viên|họ tên|email`, `<Trường> quá dài (tối đa n ký tự)`, `Email không hợp lệ`, `Trùng dòng k trong file`,
`Đã có trong lớp`, `Mã sinh viên đã thuộc tài khoản có email khác`, `Email đã gắn với mã sinh viên khác`, `Email thuộc tài khoản không phải sinh viên`.

### `POST /classes/:id/imports/:logId/confirm`
Re-validates every row, then in **one transaction** creates Pending accounts, links existing students, adds memberships, sets the log `CONFIRMED`.
→ `{ importedCount, skippedCount }`, message MSG-45 "Đã nhập {n} sinh viên, bỏ qua {m} dòng không hợp lệ."
No valid row left → 409 (log stays `PREVIEW`).

### `POST /classes/:id/imports/:logId/cancel`
Sets the log `CANCELLED` (idempotent). The FE calls it when the dialog is closed.

## Audit
`audit_logs` rows are written for: class create/update/end, member add/remove, import confirm.

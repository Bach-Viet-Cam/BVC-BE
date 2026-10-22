# M03 · Assignments API — lecturer side (sub-project 3a)

Base path `/api/v1`, Bearer token required. Envelope and error format as in `m03-classes.md`.

An assignment is a **practice post for the whole class**. There is no grading, rubric, deadline or submission limit (user decision 16/10).
Students submit recordings any number of times while the assignment is published and the class is active.
The lecturer sees per-student numbers and comments on individual submissions.

Kinds: `SOLO` Độc tấu · `ENSEMBLE` Hòa tấu · `BONUS` Bonus · `OTHER` Bài tập khác.
Status: `DRAFT` → `PUBLISHED` ⇄ `CLOSED`. Delete is soft.

## Grading settings (System Admin only)

| Method | Path | Body / result |
|---|---|---|
| GET | `/admin/settings/grading` | `{ minAccuracy, atRiskMargin, updatedAt }` (initial 70 / 40) |
| PUT | `/admin/settings/grading` | `{ minAccuracy, atRiskMargin }`: integers 0–100 and `atRiskMargin ≤ minAccuracy` → "Lưu cấu hình chấm điểm thành công." |

Values live only in `system_settings`. A missing key is a server error; there is no hardcoded fallback.

## Assignments (lecturer who owns the class)

Rules for every endpoint:
- A class or assignment of another lecturer, or a deleted assignment → **404**. Other roles → **403**.
- Any write on a finished class → **409** `MSG-08`.
- Ending a class closes its published assignments.

### `GET /assignments?classId&kind&status&q&page&limit`
→ `{ items: [{ id, classId, className, status, version, title, kind, submittedCount, memberCount, updatedAt }], pagination }`
`submittedCount` = active members with at least one counted submission. Rejected and failed submissions do not count (GBR-13).

### `GET /assignments/pieces?classId=`
Visible pieces (songs and finger exercises) of the class instrument → `[{ id, title, kind, defaultBpm }]`.

### `POST /assignments` → 201
```json
{ "classId": "…", "title": "Độc tấu — Lý ngựa ô", "description": "…", "kind": "SOLO",
  "pieceId": null, "requiredBpm": 90, "publish": true }
```
Validation:
- title 1–200 after trim;
- description ≤ 1000;
- `requiredBpm` integer 1–300 or null (null = the piece's default BPM);
- `pieceId` must be a visible piece of the class instrument, otherwise MSG-48 on field `pieceId`.

`publish: true` creates the assignment as PUBLISHED and notifies active members ("Bài tập mới"); `publish: false` creates a DRAFT.

Response (also for every other write):
```json
{ "id", "classId", "className", "classStatus", "status", "version", "title", "description", "kind",
  "piece": { "id", "title", "defaultBpm", "isAvailable" } | null, "requiredBpm", "effectiveBpm",
  "publishedAt", "closedAt", "updatedAt" }
```

### `PUT /assignments/:id`
Same fields without `classId` and `publish`. Creates a **new version**; earlier submissions keep the version they were made on.
Allowed for drafts, published and closed assignments. If the assignment is published, members are notified ("Bài tập đã được cập nhật").
If nothing changed (title, description, kind, piece, BPM after trimming), no version is created and nobody is notified; the current assignment is returned.

### `POST /assignments/:id/publish | close | reopen`
`publish` only from DRAFT (notifies members, "Bài tập mới"), `close` only from PUBLISHED (no notification), `reopen` only from CLOSED (notifies members, "Bài tập đã được mở lại"). Any other state → 409.

### `DELETE /assignments/:id`
Soft delete, without a notification. The assignment disappears for everyone and its submissions no longer count towards progress.

### `GET /assignments/:id`
The response above plus `students[]`, one row per active member:
`{ studentId, fullName, studentCode, status: NOT_SUBMITTED | SUBMITTED | PASSED, submissionCount, lastSubmittedAt, bestAccuracy }`.
**PASSED** means a completed submission with `accuracy ≥ minAccuracy`. The status is computed on read, so it follows the current settings.

### `GET /assignments/:id/students/:studentId/submissions`
```json
{ "student": { "id", "fullName", "studentCode" }, "canComment": true,
  "submissions": [{ "id", "attemptNumber", "version", "status", "accuracy", "tempoDeviation",
                    "audioUrl", "submittedAt", "comment": { "content", "updatedAt" } | null }] }
```
- Newest first. `attemptNumber` counts every submission, oldest = 1.
- `canComment` is false when the class is finished or the student has left the class.
- A student who is not in the class and never submitted → 404.

## Comments

### `PUT /submissions/:id/comment` `{ content }`
- Content 1–2000 after trim. One comment per submission; saving again overwrites it.
- The first save notifies the student ("Giảng viên đã nhận xét bài nộp") → "Gửi nhận xét thành công.". Later saves → "Cập nhật nhận xét thành công.", without a notification.
- Locked (409) when the class is finished or the student has left the class.

## For M01

`SubmissionPolicyService.canSubmit(studentId, assignmentId)` returns `{ allowed, reason }`. It allows a submission only when:
- the assignment is published and not deleted;
- the class is active;
- the student is an active member.

Otherwise `reason` = "Không thể nộp bài vì bài tập đã đóng hoặc không còn khả dụng.". *(TODO(M01): call it before creating a submission.)*

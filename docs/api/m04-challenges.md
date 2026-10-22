# M04 · Weekly Challenges API - lecturer side (UC-18, FR-M04.06.01)

Base path `/api/v1/lecturer/challenges`, Bearer token required, **TEACHER role only** (other roles → **403**, no token → **401**; authentication and role run before validation). Envelope and error format as in `m03-classes.md`.

A weekly challenge is a **practice challenge for a fixed calendar week**, created by a lecturer for one piece, one instrument and one or more of the lecturer's own active classes.
This function only creates and manages challenges. Students joining, submitting, leaderboard, statistics and grading belong to other functions (see Deferred).

Status stored: `DRAFT` → `PUBLISHED`. Display status is derived from time on every read (no scheduler):
`DRAFT` Bản nháp · `UPCOMING` Sắp diễn ra (`now < startsAt`) · `ACTIVE` Đang diễn ra · `ENDED` Đã kết thúc (`now > endsAt`).

## Week rules

- A week is Monday 00:00 to Sunday 23:59:59.999 in UTC+7, stored as UTC. Example: `weekStart = 2026-12-28` → `startsAt = 2026-12-27T17:00:00.000Z`, `endsAt = 2027-01-03T16:59:59.999Z`.
- `weekStart` is `YYYY-MM-DD` and must be a Monday, otherwise 400 on `weekStart` (MSG-08). A week that has already ended → 400 MSG-04. Only the current or a future week is allowed.
- Publishing the **current** week sets `startsAt = now` (the challenge is ACTIVE immediately); `endsAt` stays Sunday 23:59:59.999. Publishing recomputes the period, so a draft saved earlier in the week is re-evaluated at publish time.
- Drafts store the full week bounds (or null when no week is chosen). The response `weekStart` is always the Monday of the stored week.

## Endpoints

### `GET /`  ?page=1&limit=20
→ `{ items: [Challenge], pagination: { page, limit, total } }`. Own challenges only (all statuses), newest `updatedAt` first. `limit` 1-100.

### `GET /form-meta`
→ `{ defaultMinAccuracy, maxSubmissionsDefault }`. `defaultMinAccuracy` is the system grading default (`system_settings`), readable by lecturers (the admin endpoint is admin-only). `maxSubmissionsDefault` = 3.

### `GET /pieces?instrumentId&q`
Pieces (songs and finger exercises) that are **ready**: available piece, public Main sheet for the instrument, reference audio present and analysis `READY`. Max 50, sorted by title.
→ `{ items: [{ id, title, composer, kind, bpm }], pagination }`.

### `GET /:id`
→ `Challenge`. Another lecturer's or unknown challenge → **404** "Không tìm thấy thử thách."

### `POST /` → 201
```json
{ "title": "Thử thách tuần 52", "description": "…", "instrumentId": "…", "pieceId": "…",
  "classIds": ["…"], "weekStart": "2026-12-28", "minAccuracy": 70, "requiredBpm": null,
  "maxSubmissions": 3, "publish": false }
```
| Field | Rule |
|---|---|
| `title` | required, 1-100 after trim (MSG-35 / MSG-37) |
| `description` | ≤ 2000 after trim; empty becomes null (MSG-37) |
| `minAccuracy` | integer 0-100 or null (null = no minimum) (MSG-03) |
| `requiredBpm` | integer 30-240 or null (null = the piece's BPM) (MSG-03) |
| `maxSubmissions` | integer 1-10, default 3 (cap `maxSubmissionsCap` = 10) (MSG-03) |
| `classIds` | uuid array, de-duplicated, ≤ 50 |
| `publish` | boolean, default `false` |

**Draft (`publish: false`)** → 201 "Tạo thử thách thành công.": only `title` is required. `instrumentId`, `pieceId`, `classIds`, `weekStart` are all optional. Whatever is given is still checked: week rules above, every class must be owned by the lecturer (404 otherwise), not finished (409 MSG-08) and of the same instrument (400 on `classIds`), piece must exist and be available for the instrument (400 MSG-48). Readiness of the piece and non-empty classes are **not** required for a draft.

**Publish (`publish: true`)** → 201 "Đăng thử thách thành công.": `instrumentId`, `pieceId`, `classIds` (≥ 1), `weekStart` are required; all missing fields are returned together (400, MSG-35, `fieldErrors[]`). Then, inside one transaction:
1. the lecturer's publishes are serialised (advisory lock) and the draft row is locked;
2. week, classes (owned, active, same instrument, **at least one active student**, 409 MSG-08 otherwise) and piece readiness (400 MSG-48 on `pieceId`) are checked against the state the transaction sees;
3. overlap: another PUBLISHED challenge of the same lecturer + instrument + overlapping period sharing any class → **409** MSG-08 "lớp đã có thử thách khác trong tuần này";
4. the main sheet is resolved and stored (`sheetMusicId`), status set to PUBLISHED, `startsAt/endsAt/publishedAt` stored;
5. audit log `CHALLENGE_PUBLISH` and the notification (below).

Any unexpected failure rolls everything back → **500** MSG-09 "Đăng thử thách".

### `PATCH /:id` → 200 "Cập nhật thử thách thành công."
Drafts only. Same fields as create without `publish`; omitted fields keep their value, `null` clears `description`, `instrumentId`, `pieceId`, `weekStart`, `minAccuracy`, `requiredBpm`. `classIds` replaces the whole set. Class and piece checks run only when `classIds`, `pieceId` or `instrumentId` is part of the patch. A non-draft → **409** MSG-08 "thử thách đã được đăng". It cannot publish.

### `DELETE /:id` → 200 "Xóa thử thách thành công."
Drafts only, **hard delete** (nothing references a draft). A non-draft → 409 MSG-08.

### `POST /:id/publish` → 200 "Đăng thử thách thành công."
Publishes a saved draft with the same transaction as above, re-reading the stored fields inside the transaction. Not a draft (also when two requests race: exactly one wins, the other gets **409** MSG-08) → 409; another lecturer's → 404; incomplete draft → 400 with all missing fields.

## Challenge response

```json
{ "id", "title", "description", "status": "DRAFT|PUBLISHED", "displayStatus": "DRAFT|UPCOMING|ACTIVE|ENDED",
  "instrument": { … } | null, "piece": { … } | null, "classes": [{ … }],
  "weekStart": "2026-12-28" | null, "startsAt": ISO | null, "endsAt": ISO | null,
  "minAccuracy", "requiredBpm", "maxSubmissions", "publishedAt", "createdAt", "updatedAt" }
```

## Error codes

| Status | Code | When |
|---|---|---|
| 400 | MSG-35 / MSG-37 / MSG-03 | required / too long / out of range (field in `field`, all in `fieldErrors`) |
| 400 | MSG-04 | week already ended |
| 400 | MSG-08 | `weekStart` is not a Monday (field `weekStart`) |
| 400 | MSG-48 | piece missing, unavailable, or not ready (no reference audio / analysis not finished) |
| 400 | - | class instrument differs from challenge instrument (field `classIds`) |
| 401 / 403 | - | no token / not a lecturer |
| 404 | - | challenge, or class not owned by the lecturer |
| 409 | MSG-08 | not a draft, finished class, class without students, overlap, concurrent publish |
| 500 | MSG-09 | publish failed and rolled back |

## Notification on publish (D8)

On publish, active members of all selected classes receive one in-app notification (a student in several classes gets one): title "Thử thách mới", body `<class names> · <challenge title>`, link `/challenge/<id>`. It is written in the publish transaction through `NotificationService.notifyUsers`. Reminders are deferred.

## Decisions (D1-D15)

| # | Decision | Status |
|---|---|---|
| D1 | One piece + one instrument, resolved to that instrument's Main sheet; stores `piece_id`, `sheet_music_id` | Done |
| D2 | Scope = lecturer's own ACTIVE classes of the chosen instrument (multi-select, ≥ 1); cohort/system scope deferred | Done, pending Q1 |
| D3 | Fixed Monday-Sunday week in UTC+7; current week starts at `now`; current or future week only | Done, pending Q2 |
| D4 | One PUBLISHED challenge per lecturer + instrument + week where class sets overlap, else 409 MSG-08, checked in the publish transaction | Done |
| D5 | Store DRAFT/PUBLISHED, derive display status from time, no scheduler; nullable `paused_at` kept for later | Done |
| D6 | Drafts editable/deletable (hard delete); published are read-only | Done, pending Q3 |
| D7 | Requirements `minAccuracy`, `requiredBpm` (30-240), `maxSubmissions` (1-10, default 3) | Done, pending Q4 |
| D8 | Notification on publish (optional) | Done |
| D9 | Only ACTIVE classes selectable; publish re-checks | Done |
| D10 | Leaderboard link not part of this function | Done |
| D11 | No migration file (project rule); schema edit in Prisma only | Done |
| D12 | Default accuracy exposed to lecturers through `GET /form-meta` | Done |
| D13 | Piece readiness via `ChallengeRules.isPieceReady` | Done |
| D14 | Route prefix `/api/v1/lecturer/challenges`, module `modules/challenges/` | Done |
| D15 | Lecturer UI is web-first, single-column responsive layout, 44 px targets | Done (FE) |

## Open questions for the BA

- **Q1** Own classes only, or cohort/system-wide publishing? (D2)
- **Q2** Fixed calendar week mandatory, or any date range? (D3)
- **Q3** May a published challenge be edited or cancelled in v1? (D6)
- **Q4** Which participation requirements are needed: min accuracy, BPM, max attempts? (D7)

## Deferred (not in FR-M04.06.01)

Pause/resume, reminders, viewing and grading submissions, statistics, editing or cancelling a published challenge, and the functions FR-M04.06.02 (student list/join), 04, 03 and 05.

## SRS defects to report

1. FR §III.4.3.1 field table lists only 4 UI elements: no required flags, lengths, ranges or messages.
2. UC 4.4 (Leaderboard) postconditions are copied from this UC.
3. Numbering mismatch: WBS UC-18 = SRS UC table #21; table #18 is "Review Submissions".
4. No business rule defines scope, period boundaries, overlap, or editing after publish (D2-D6).

## For FR-M04.06.02 / 04 owners

- `Submission.assignmentId` is currently required; 06.02 must make it nullable and add an optional `challengeId` (not done here).
- The student list should show `PUBLISHED` challenges where `startsAt <= now <= endsAt` and the student is an active member of a class in `challenge_classes`; GBR-58 compares against `startsAt/endsAt`.
- `minAccuracy`, `requiredBpm`, `maxSubmissions` are stored for 06.02 to enforce; `requiredBpm = null` means the piece's BPM. GBR-57 (≥ 90 % auto-propose) needs no schema change.

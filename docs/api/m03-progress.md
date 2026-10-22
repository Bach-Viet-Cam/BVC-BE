# M03 · Progress API (sub-project 4, FR-M03.02.03)

Base path `/api/v1`, Bearer token required. Envelope and error format as in `m03-classes.md`.
All values are computed on read; nothing is stored.

## Rules

**Counted assignments:** published or closed, not deleted, current kind ≠ `BONUS` (user decision P1).

**Average:** for each counted assignment, take the student's best `COMPLETED` accuracy, then average those values. Rounded to 2 decimals.

**Status** uses `system_settings` (`grading.minAccuracy`, `grading.atRiskMargin`), never a hardcoded value:

| Status | Condition |
|---|---|
| `ON_TRACK` | `average ≥ min` |
| `AT_RISK` | `min − margin ≤ average < min` |
| `BEHIND` | `average < min − margin` |
| `null` | no data; shown as "-" and counted as `NO_DATA` |

**Weeks:** week k = `[start + 7(k−1), start + 7k − 1]`, using Vietnam calendar days. Submissions outside weeks 1–6 are not in the chart.

**Sessions:** every submission in the class, including rejected / failed and Bonus ones, except submissions of deleted assignments.

## Access

| Endpoint | Lecturer (role 2) | Student (role 1) | Admin |
|---|---|---|---|
| `GET /classes/:id/progress` | owner only | 403 | 403 |
| `GET /classes/:id/students/:studentId/summary` and `/history` | owner; the student may be a current member or a former member with submissions | only their own `studentId`, while an active member | 403 |

Anything else → 404 (existence is not leaked).

## `GET /classes/:id/progress`
Active members, sorted by name:
```json
{ "counts": { "ON_TRACK": 3, "AT_RISK": 6, "BEHIND": 1, "NO_DATA": 11 },
  "students": [{ "studentId", "fullName", "studentCode", "average": 72.5, "status": "ON_TRACK",
                 "assignmentsWithSubmissions": 2, "lastSubmittedAt": "2026-10-16T02:30:00.000Z" }] }
```

## `GET /classes/:id/students/:studentId/summary`
```json
{ "student": { "id", "fullName", "studentCode" },
  "class": { "id", "name", "cohort", "instrument": { "id", "name" }, "startDate": "2026-09-25" },
  "average": 72.5, "status": "ON_TRACK", "minAccuracy": 70,
  "totalSessions": 12, "sessionsLast7Days": 4,
  "weekly": [{ "week": 1, "startDate": "2026-09-25", "endDate": "2026-10-01", "average": 61.5 }, … 6 items, "average": null when empty] }
```
`weekly[k].average` = mean of every completed submission of counted assignments in that week (not only the best).
`sessionsLast7Days` counts the last 7 × 24 hours.

## `GET /classes/:id/students/:studentId/history?from&to&page&limit`
Newest first. `from` / `to` are `yyyy-MM-dd` Vietnam calendar days, both inclusive, each optional. `limit` defaults to 50, max 200.
```json
{ "items": [{ "submissionId", "assignmentId", "assignmentTitle", "kind", "status", "accuracy", "submittedAt" }],
  "pagination": { "page": 1, "limit": 50, "total": 12 } }
```
`from > to` → 400:
```json
{ "errors": [{ "field": "from", "code": "MSG-04", "message": "Từ ngày không được sau đến ngày." }] }
```

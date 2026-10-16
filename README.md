# Bach Viet Cam Backend

Node.js and Express backend organized by domain modules.

## Development

```bash
npm install
npm run db:push   # sync prisma/schema.prisma to DATABASE_URL
npm run db:seed   # catalog (instruments, genres, levels, file limits), demo users, 8 demo pieces
npm run dev
```

The API runs at `http://localhost:3000` by default. The seed prints dev access tokens for the demo users.

Health check: `GET /api/health`

## Tests

```bash
npm test
```

Integration tests (Vitest + Supertest) run against a real PostgreSQL database given by `TEST_DATABASE_URL`
(default `postgresql://postgres:postgres@localhost:5432/bvc_m02_test`). The schema is pushed once per run
and every test file truncates the tables, so never point it at a database with real data.

## Modules

- `auth`
- `classes`
- `community`
- `ensemble`
- `music-library` – M02: pieces, sheet music, uploads, public library, saved items, AI analysis jobs
- `platform`

## Music library (M02) API – prefix `/api/v1`

| Area | Endpoints |
|---|---|
| Uploads (lecturer) | `POST /uploads/presign` → PUT the file to `uploadUrl` → `POST /uploads/:id/confirm` (attaching a file also confirms it) |
| Pieces (lecturer) | `GET/POST /lecturer/pieces`, `GET/PUT /lecturer/pieces/:id`, `PATCH /lecturer/pieces/:id/visibility`, `PUT/DELETE /lecturer/pieces/:id/cover` |
| Sheet music (lecturer) | `GET/POST /lecturer/pieces/:id/sheet-music`, `GET/PUT /lecturer/sheet-music/:id`, `PUT /lecturer/sheet-music/:id/files/:slot` (`sheet`/`audio`/`video`), `PATCH /lecturer/sheet-music/:id/visibility` |
| Library (public) | `GET /library/filters`, `GET /library/pieces`, `GET /library/pieces/:id`, `GET /library/sheet-music/:id` |
| Saved (student) | `GET /me/saved?type=PIECE\|SHEET_MUSIC`, `PUT/DELETE /me/saved/pieces/:id`, `PUT/DELETE /me/saved/sheet-music/:id` |
| AI callback | `POST /internal/sheet-music/:id/analysis` (header `X-Callback-Secret`) |

Errors carry the system message code: `{ success: false, code: 'MSG-xx', field?, message }`.
Lists return `{ items, total, page, pageSize, totalPages }` inside `data`.

Setting `MOCK_AI_SERVICE=true` and `AI_SERVICE_URL=http://localhost:3000/api/v1/internal/mock-ai` lets the
analysis flow complete locally without the Python service.

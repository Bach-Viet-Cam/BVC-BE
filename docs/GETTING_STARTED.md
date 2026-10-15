# Getting Started

1. Copy `.env.example` to `.env` and update the database connection when a local database is available.
2. Install dependencies with `npm install`.
3. Start development mode with `npm run dev`.
4. Verify `GET /api/health`.

## Local database (Docker or Podman)

`docker-compose.dev.yml` runs Postgres 16 on port **5433** with two databases: `bvc_dev` and `bvc_test`.

```bash
npm run db:up                    # or: podman compose -f docker-compose.dev.yml up -d
export DATABASE_URL=postgresql://bvc:bvc_local@localhost:5433/bvc_dev
npm run db:deploy                # apply prisma/migrations
npm run db:seed                  # demo data; SEED_LECTURER_EMAIL=<your Google email> to log in as lecturer #1
```

The seed refuses to run against anything but the local port-5433 database unless `ALLOW_SEED=true`.

## Migrations

Schema changes go through `prisma/migrations` (`npx prisma migrate dev --name <name>` in an interactive terminal).
`0_baseline` is the pre-M03 schema: on a database that already has those tables (the shared DB), mark it applied once with
`npx prisma migrate resolve --applied 0_baseline`, then `npx prisma migrate deploy`.
Prisma does not generate down migrations; each migration folder that needs a rollback ships a hand-written `down.sql`.

## Tests

```bash
DATABASE_URL=postgresql://bvc:bvc_local@localhost:5433/bvc_test npx prisma migrate deploy   # once per schema change
npm test                 # Vitest: unit + integration (integration tests truncate TEST_DATABASE_URL)
npm run test:coverage    # coverage threshold 70 % on the M03 classes module
```

API reference for M03: `docs/api/m03-classes.md`.

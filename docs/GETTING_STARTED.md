# Getting Started

1. Copy `.env.example` to `.env` and update the database connection when a local database is available.
2. Install dependencies with `npm install`.
3. Start development mode with `npm run dev`.
4. Verify `GET /api/health`.

Prisma is configured for PostgreSQL in `prisma/schema.prisma`. No migration is included until the domain models are defined.

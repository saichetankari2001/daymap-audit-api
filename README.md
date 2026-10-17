# Daymap Audit System

A standalone audit-logging microservice for Civica/Daymap. Other Daymap systems report every access to sensitive student data to this service over a REST API; it stores that history, enforces strict tenant/school access scoping, and automatically archives old records to keep running costs low.

Built for Harry Macheda (Civica/Daymap) by the MG1 team: Saichetan, Vishnu, Rahul, Indra, Surbhi, Nivil, Basil.

## What this is

- **Write/query API** — other systems submit audit entries (single or batched), and query them back with cursor-based, snapshot-consistent pagination.
- **API key authentication** — every request requires a key with `read`, `write`, or `admin` permission, scoped to a tenant (covers every school under it) or a specific `(tenant, school)` pair.
- **Archival job** — entries past a configurable retention window move automatically from PostgreSQL into cold-storage files on disk.

See `docs/specs/2026-08-21-project-plan-and-architecture.md` for the full architecture and design rationale, and `docs/specs/2026-09-29-load-testing-results.md` for real load-test results and findings.

## Running it locally

Requires Docker and Node.js.

```bash
# 1. Install dependencies
npm install

# 2. Copy the env files and adjust if needed
cp .env.example .env
cp .env.test.example .env.test

# 3. Start PostgreSQL (dev + test databases)
docker compose up -d
docker compose -f docker-compose.test.yml up -d

# 4. Apply database migrations
npm run prisma:migrate:deploy

# 5. Create an admin API key (prints once — copy it)
npm run create-admin-key

# 6. (Optional) Seed sample audit data
npm run seed 150

# 7. Start the dev server
npm run dev
```

The server runs at `http://localhost:4000`. A demo dashboard is available at `http://localhost:4000/dashboard.html` — paste your admin key in to browse entries, create scoped keys, and run the archival job from the browser.

## Running the tests

```bash
npm run test:unit         # unit tests — no database required
npm run test:integration  # integration tests — requires the test database (docker-compose.test.yml)
```

Both suites run against a real PostgreSQL instance, not a mock.

## API overview

| Method | Path | Requires | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | nothing | Liveness check |
| POST | `/entries` | `write` | Submit one entry or a batch (up to 1,000) |
| GET | `/entries` | `read` | Query entries, cursor-paginated, snapshot-consistent |
| POST | `/api-keys` | `admin` | Create a new key (one or more scopes) |
| GET | `/api-keys` | `admin` | List all keys |
| DELETE | `/api-keys/:id` | `admin` | Revoke a key immediately |
| POST | `/admin/archive` | `admin` | Run the archival job on demand |
| GET | `/admin/cold-storage` | `admin` | List archived files and their entry counts |

## Project structure

```
src/
  controllers/   request handling
  services/      business logic
  repositories/  database access (Prisma)
  middleware/    auth, validation, error handling
  schemas/       Zod request/response validation
  jobs/archival/ the archival job
  scripts/       one-off CLI scripts (admin key creation, sample data)
docs/specs/      architecture, design decisions, load-testing results
tests/           unit and integration tests
```

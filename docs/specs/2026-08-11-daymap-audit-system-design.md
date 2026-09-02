# Daymap Audit System — Design Spec (IN PROGRESS)

Date: 2026-08-11

**Status: design in progress — only the big-picture architecture (Section 1) has been walked through and captured so far. This document will be extended as the rest of the design is worked through.**

## Client & Context

Client: Harry Macheda, Software Engineer at Civica/Daymap.

Daymap is a school-management platform (similar to Canvas). This system is a revamp of their auditing infrastructure: recording who accessed or changed sensitive data (e.g. student records), for compliance investigations. Team: 7 people.

Full original client brief is preserved in the project conversation history; key requirements summarized below.

## Assumption Status

Harry has not yet answered the clarifying questions we plan to send him (query patterns/expected result sizes, whether jurisdiction/schoolCode are free-text or a fixed list, whether cold data needs any programmatic retrieval path, deployment target). **This design proceeds with documented, reasonable assumptions for those open points, clearly flagged below, to be confirmed/corrected once Harry replies — nothing here should be treated as locked in until then.**

## Core Requirements (from Harry's brief)

- Ingest ~1 million entries/minute (~1GB/minute) at peak.
- Entries are JSON: required fields `date`, `jurisdiction`, `schoolCode` (typing loose — assume datetime/string/string), plus arbitrary additional key-value pairs per entry.
- Two-tier storage: **hot** (fast, API-readable, configurable retention window) and **cold** (cheap, bulk, long-term — NOT readable via the API once data is cold).
- A configurable scheduled job syncs aged-out hot data to cold storage.
- Hot storage must be indexed for fast search on common fields, and easy to extend with new required fields later.
- Write endpoint accepts a single entry or an array of entries.
- Reads must never block/lock against writes.
- Reads are paginated, and pagination must be **snapshot-consistent**: once the first page of a query is requested, later pages of that same query ignore anything written after that first request (no "pagination weirdness" from concurrent writes).
- Reads must be filterable on the required fields AND on arbitrary extra fields, whether or not a given entry has that field.
- Auth: togglable (on/off via config), API key/token based, roles (read/write), scoped to one or more jurisdiction/schoolCode combinations per key.
- All configuration via environment variables/settings file.
- Modular design: easy to swap storage backends (e.g. local file → Azure Blob) without a rewrite; built for testability (unit + integration).
- Cost-consciousness matters — this shaped the storage/queue choices below (e.g. avoiding server-based document stores, preferring managed/cheap-at-rest options).

## Decisions Made So Far

| Decision                                     | Choice                                                                                                                               | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language/stack                               | Node.js + TypeScript                                                                                                                 | Matches the team's proven delivery experience from `audit-api`/`booking-api` — fastest path to actually shipping in a semester. Node's non-blocking I/O also suits a high-throughput ingestion API well.                                                                                                                                                                                                                                                                                                                                        |
| Hot storage                                  | PostgreSQL, written via batched inserts (not one row per write)                                                                      | Matches Harry's own suggestion. Reuses the batching-queue lesson from `audit-api`, scaled up via a durable queue (below) instead of an in-memory one.                                                                                                                                                                                                                                                                                                                                                                                           |
| Cold storage                                 | Local file storage for the MVP, designed to be swapped for Azure Blob Storage (Archive tier) later                                   | Harry explicitly said local file storage is fine for now since pointing it at Blob Storage later is trivial — this is his own stated preference, not something we need to re-decide.                                                                                                                                                                                                                                                                                                                                                            |
| Durable queue between write API and Postgres | Azure Event Hubs                                                                                                                     | Daymap is already on Azure; a managed, durable, horizontally-scalable ingestion buffer that lets the write API and the Postgres writer scale independently, and absorbs backpressure if Postgres falls behind.                                                                                                                                                                                                                                                                                                                                  |
| Entry schema                                 | Fixed, indexed columns for `date`/`jurisdiction`/`schoolCode`, plus one `JSONB` column (with a GIN index) for arbitrary extra fields | Required fields get fast, always-present indexed filtering (the common case); arbitrary fields stay flexible without needing a schema migration every time a school wants to track something new. Rejected a fully dynamic key-value (EAV) table — well-known to be slow at this scale and painful to query.                                                                                                                                                                                                                                    |
| Service topology                             | Two separate deployable services (`ingest-api` + `writer-worker`), talking through Event Hubs, plus a separate scheduled `sync-job`  | `ingest-api` only validates and publishes to Event Hubs — extremely fast, never blocked by Postgres. `writer-worker` consumes from Event Hubs and does the actual batched Postgres writes, and can be scaled independently of `ingest-api`. This directly satisfies the brief's "scale out, multiple instances against one datastore" requirement. Read/query endpoints live inside `ingest-api` (renamed conceptually to include queries) rather than as a fourth service, since read traffic isn't the bottleneck the brief is worried about. |

## Section 1: The Big Picture (as presented to the team)

Two separate services, plus a scheduled job:

- **`ingest-api`** — a thin Node/TypeScript service. Its only job: accept `POST` requests with one entry or an array of entries, validate the required fields (`date`, `jurisdiction`, `schoolCode`), check the API key/scope, and publish the entry onto **Azure Event Hubs**. Responds fast, doesn't touch Postgres directly at all.
- **`writer-worker`** — a separate Node/TypeScript service that continuously reads from Event Hubs, batches entries up, and writes them into Postgres (hot storage) — the same "batch instead of one-at-a-time" idea from `audit-api`, just fed by a durable queue instead of an in-memory one.
- **`query-api`** — handles all the `GET`/read endpoints against hot storage directly (pagination, filtering). Kept bundled with `ingest-api` rather than a fourth service, since the brief's "scale out"/"don't block reads or writes" concerns are about the _write path_ being slow, not about needing read traffic on separate hardware.
- **`sync-job`** — a scheduled task (runs on a timer, e.g. daily, per configuration) that finds hot-storage entries older than the configured retention window, writes them out as files to cold storage (local disk for now, Azure Blob later), then removes them from hot storage.

Why split `ingest-api` from `writer-worker`? If Postgres ever gets slow or falls behind, Event Hubs absorbs the backlog like a buffer — `ingest-api` keeps accepting new entries instantly regardless, and `writer-worker` just catches up when it can. Neither one waiting on the other is exactly the brief's "handle huge write volume without falling over" requirement.

## Still To Be Designed

- Exact entry schema (column list, JSONB shape, indexes) — Section 2
- Ingestion pipeline detail (Event Hubs message shape, `writer-worker` batching/consumer logic) — Section 3
- Read/query API (endpoints, filtering across fixed + arbitrary fields, snapshot-consistent pagination mechanism) — Section 4
- `sync-job` detail (retention window config, cold file format, sync scheduling mechanism) — Section 5
- Auth (API key data model, role + jurisdiction/schoolCode scoping, on/off toggle) — Section 6
- Configuration surface (full list of env vars) — Section 7
- Local dev story (running without a real Azure subscription — e.g. local Kafka standing in for Event Hubs, since Event Hubs speaks the Kafka protocol) — Section 8
- Testing strategy — Section 9
- Team workstream split across the 7-person team — Section 10

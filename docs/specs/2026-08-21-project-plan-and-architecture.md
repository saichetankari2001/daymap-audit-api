# MG1: Web Application Audit System — Project Plan & Architecture

**Prepared for:** meeting with Harry Macheda (Civica/Daymap), 21 August 2026
**Status:** Architecture decided and partially built; API + one data store working today.

## 1. Project Overview

The Web Application Audit System (MG1) is a standalone audit microservice that captures, stores, and retrieves a record of activity within Daymap's high-traffic web applications. It exposes a REST API that other systems call to log audit events (who accessed or changed what data, and when) and to query that history for compliance, security, and dispute-resolution purposes.

This document is the team's single source of truth: confirmed requirements, the architecture we've actually decided on (not a menu of options), what's built vs. still to build, and the delivery plan.

## 2. Requirements Summary (confirmed by Harry, 18 August email)

| Area | Requirement |
|---|---|
| Query volume | Typical queries return hundreds to thousands of records; occasional queries may return hundreds of thousands. |
| Jurisdiction / school fields | Drawn from a fixed list in production, but treated as free text for this project. |
| Audit record content | Regularly includes user details (username, ID, type) and details of the data being accessed (type, name, ID). |
| Cold storage | Send-and-forget: once archived, never retrieved through the API. |
| Deployment | No cloud deployment required — local setup (Docker Compose) is the semester deliverable. |
| Access control | API access managed via API keys/tokens with varying permission levels. |
| Priority order | 1) System design/architecture. 2) A working API with at least one datastore implemented. |

## 3. System Architecture (decided, not a menu of options)

Five logical pieces. Three are built and running today; two are designed but not yet built, per Harry's own stated priority.

| Component | Responsibility | Status |
|---|---|---|
| **Ingest / Query API** | Accepts write requests (log an event) and read requests (query history). REST API. | ✅ **Built** |
| **Hot storage (PostgreSQL)** | Primary datastore for recent audit records; serves all read/write traffic. Indexed on jurisdiction, school, user, and date. | ✅ **Built** |
| **API key store** | Stores hashed API keys and their permission scope (read/write). Checked by middleware on every request. | ⬜ Designed, not built |
| **Archival job** | Runs on a schedule, independent of the API; moves records past a retention threshold from hot to cold storage. | ⬜ Designed, not built |
| **Cold storage** | Long-term, low-cost retention. Write-once; never queried by the API. | ⬜ Designed, not built |

### 3.1 Request flow

**Today (built):**
1. A client application sends a request directly to the Ingest/Query API.
2. Write requests validate the required fields (`date`, `jurisdiction`, `schoolCode`) and insert directly into Postgres.
3. Read requests query Postgres, with snapshot-consistent pagination applied — the first page of a query fixes a point in time, and later pages of that same query ignore anything written after, so a busy write stream never causes duplicate or skipped results across pages.

**Planned (not yet built), once auth and the archival pipeline are added:**
4. Every request will additionally include an API key; the API validates it against the key store and confirms the caller's permission (read or write) before processing.
5. Independently of the request path, a scheduled archival job will move records past the configured retention window from hot storage into cold storage.
6. Once in cold storage, records are retained for compliance but are not accessible via the API.

### 3.2 Why this shape, and not a larger cloud-native pipeline

An earlier internal draft explored a fuller Azure-native pipeline (API Management, Event Hubs, Stream Analytics, Data Lake Gen2, Synapse, Power BI, etc.). We're deliberately **not** presenting that as the semester plan: Harry told us directly that no cloud deployment is required and local setup is sufficient, and building against real Azure services would add cost, setup complexity, and risk without being asked for. The leaner design above is what we can actually build, test, and demonstrate this semester. The fuller Azure picture remains a reasonable *future* direction if Daymap ever wants to run this in production at full scale — worth mentioning as the long-term picture, not committing to it now.

## 4. Technology Stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Language/runtime | **Node.js + TypeScript** | Fits the workload (many small concurrent requests, not heavy computation). TypeScript catches mistakes before code runs — a real safety net given how much of this is built with AI assistance and human review. |
| API framework | **Express** | Simple, minimal, well-documented; matches the REST API the brief asks for. |
| Hot storage | **PostgreSQL** | Handles the confirmed query pattern well with indexing; free/open-source, matching the cost-consciousness in the brief. |
| Database access | **Prisma** | Type-safe queries and migrations, reducing a class of mistakes at the boundary between code and database. |
| Cold storage | **Local files now → Azure Blob Storage (Archive tier) later** | Matches Harry's own suggestion — cheapest realistic option, and the swap is designed to be trivial when the time comes. |
| Local deployment | **Docker Compose** | One command brings up Postgres identically on any team member's (or Harry's) machine. |

## 5. Data Model (built)

```prisma
model Entry {
  id           String   @id @default(uuid())
  sequence     Int      @unique @default(autoincrement())  // ordering, for pagination
  date         DateTime                                     // required
  jurisdiction String                                       // required
  schoolCode   String                                       // required
  userId       String?                                      // promoted to its own column
  extra        Json     @default("{}")                      // everything else, arbitrary
  createdAt    DateTime @default(now())

  @@index([jurisdiction, schoolCode, date])
  @@index([userId])
  // + a GIN index on `extra` for fast filtering on arbitrary fields
}
```

`date`, `jurisdiction`, and `schoolCode` are the brief's required fields. `userId` gets its own indexed column even though it's not formally "required" — Harry told us user details show up in almost every entry in practice, and "show me everything this user accessed" is exactly the kind of question this system needs to answer quickly. Everything else (username, userType, resourceType, resourceName, resourceId, and any future field a school wants to track) lives in `extra`, a flexible JSON field, GIN-indexed so it can still be searched without a schema change every time something new shows up.

## 6. API Design

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| `POST` | `/entries` | Log one entry, or an array of entries. | ✅ Built |
| `GET` | `/entries` | Query audit history — filter by jurisdiction, schoolCode, userId, date range, or any arbitrary field; snapshot-consistent pagination. | ✅ Built |
| `POST` | `/api-keys` | Create a new API key with a permission scope (admin only). | ⬜ Planned |
| `DELETE` | `/api-keys/:id` | Revoke an API key. | ⬜ Planned |

*Note: naming (`/entries` vs. `/audit-events`) should be confirmed as a team before the next milestone — the working code currently uses `/entries`.*

## 7. What's Actually Built Today (for the demo)

- `POST /entries` and `GET /entries`, fully working against a real local Postgres database
- Required-field validation (missing `date`/`jurisdiction`/`schoolCode` is rejected with a `422`)
- Filtering on jurisdiction, schoolCode, userId, date range, and arbitrary extra fields
- **Snapshot-consistent pagination, genuinely proven by an automated test**: page 1 of a query is fetched, more data is written, page 2 of the *same* query still only sees what existed at the time page 1 was requested
- A visual dashboard (`/dashboard.html`) for demoing this live — write an entry, browse/filter entries, see the architecture picture (built vs. planned) at a glance
- 9 integration tests + 2 unit tests, all passing; TypeScript typecheck and lint clean

## 8. Delivery Plan — 9 Weeks

Adjusted to reflect where we actually are: Phase 1 is done, Phase 2 has started.

| Week | Phase | Focus | Status |
|---|---|---|---|
| 1 | Phase 1 | Client meeting; finalise requirements; agree architecture, data model, and tech stack. | ✅ Done |
| 2 | Phase 1 | Architecture document; repo, Docker Compose skeleton, dev environment. | ✅ Done |
| 3 | Phase 2 | Hot storage schema and migrations; write endpoint (`POST /entries`). | ✅ Done |
| 4 | Phase 2 | Read/query endpoint with filtering and snapshot-consistent pagination. | ✅ Done |
| 5 | Phase 2 | API key creation, storage, and permission scopes; auth middleware on all endpoints. | ⬜ Next |
| 6 | Phase 2 | Integration testing of the full API; sample data; mid-project check-in with Harry. | ⬜ Planned |
| 7 | Phase 3 | Archival job; cold storage; configurable retention threshold. | ⬜ Planned |
| 8 | Phase 4 | Load testing against expected query volumes; logging/observability; fixes. | ⬜ Planned |
| 9 | Phase 4 | Documentation, local deployment instructions, demo; final presentation. | ⬜ Planned |

## 9. Client Meeting Preparation

### 9.1 What we're bringing today
- This document
- A live demo: the dashboard, a real write, a real filtered query, and the snapshot-pagination proof
- A rough allocation of the 7 team members across workstreams (auth, archival job, testing/docs, integration) for the weeks ahead

### 9.2 Questions for Harry
1. What retention period should trigger archival from hot to cold storage (e.g. 30, 90 days)?
2. What permission scopes are actually needed — just read/write, or more granular (per-jurisdiction access, admin-only key management)?
3. Can Civica share a small sample of real audit log data, or should we finalise our own generated dataset?
4. Is there a fixed set of "action" values, or is that free text too?
5. Should queries support filtering by multiple jurisdictions/schools at once, or always a single scope?
6. Is there an expected response time for queries, given the occasional hundreds-of-thousands result set?
7. Who is expected to create API keys — end users, or only administrators?
8. How will the project be assessed at the end of semester — architecture document, working demo, or both?
9. What's the best way to keep you in the loop going forward — regular check-ins, or as-needed?

### 9.3 Questions we should expect from Harry, and our honest answers

| Likely question | Our answer |
|---|---|
| Walk me through your architecture. | Ingest/Query API → Postgres (hot storage) today; API keys, an archival job, and cold storage are designed but not built yet. |
| Why Node.js/TypeScript and Postgres? | Fits the workload, TypeScript catches mistakes early, Postgres handles the confirmed query pattern well and is free. |
| How do you handle write-heavy ingestion without slowing the source app? | Designed to move to a queue (Event Hubs) feeding a separate writer process once we build that piece — today, direct writes are fine at prototype scale, but this is the next architectural step, not yet built. |
| How does your permission model work? | Designed (API key → role → allowed jurisdictions/schools) but not built yet — next on our plan (Week 5). |
| What happens if query volume spikes to hundreds of thousands of records? | Pagination is already built and tested; full load testing against that volume is planned for Week 8. |
| How are you splitting the work across seven people? | By component: API/auth, archival job, testing/docs, integration — to be finalised this week. |
| What are you unsure about, or what do you need from me? | See Section 9.2 above. |

## 10. Assumptions & Open Items

- Sample audit data will be either supplied by Civica or generated by the team — either is acceptable per Harry.
- Exact retention period before archival: to be confirmed with Harry.
- Specific permission scopes: to be confirmed with Harry.
- Endpoint naming (`/entries` vs. `/audit-events`): to be finalised by the team.
- The fuller Azure-native architecture (API Management, Event Hubs, Stream Analytics, Data Lake, Synapse, Power BI) remains a valid long-term production direction, not part of this semester's deliverable.

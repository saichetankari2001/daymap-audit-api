# MG1: Web Application Audit System — Project Plan & Architecture

Prepared by the MG1 team for our meeting with Harry Macheda (Civica/Daymap).
Team: Saichetan (lead), Vishnu, Rahul, Indra, Surbhi, Nivil, Basil.

## 1. Project Overview

Daymap needs a way to keep a reliable record of who accessed or changed sensitive data across its school-management platform, so that if a compliance investigation ever comes up, there's an accurate history to look back on. Our job is to build that record-keeping system as a standalone service: other Daymap systems send it events over a REST API, and it stores and serves that history back on request.

This document sets out what we've confirmed with Harry so far, the architecture we've settled on, what's already built and working, and how we're splitting the remaining work across the team for the rest of the semester.

## 2. What Harry Has Confirmed

Harry answered our clarifying questions by email on 18 August. The key points:

- A typical query comes back with anywhere from a few hundred to a few thousand records, though occasionally it could be in the hundreds of thousands.
- Jurisdiction and school code are drawn from a fixed list in Daymap's production systems, but for our purposes we can treat them as plain free text.
- Most audit records will include some detail about the user involved (username, ID, type) and about what was accessed (type, name, ID).
- Once data moves into cold storage, it's genuinely done with — the API never needs to read it back.
- We don't need to deploy to Azure or any cloud environment this semester. A local setup running through Docker Compose is enough.
- Access to the API is controlled through API keys with different permission levels.
- Harry was explicit about priority: getting the design and architecture right matters more than having every feature built, but we do need a real, working API against at least one datastore.

## 3. Architecture

We landed on five pieces. Two of them are built and running today; the rest are designed and agreed, but not built yet — which lines up with Harry's own priority order above.

![MG1 architecture diagram](assets/architecture.png)

**The ingest/query API** is the only thing other systems talk to. It checks incoming requests, validates the required fields, and either writes a new record or answers a query.

**Hot storage**, a PostgreSQL database, is where recent records actually live and where all the searching happens. It's indexed on the fields people will search by most.

**The API key store** doesn't exist yet, but the plan is straightforward: hashed keys sit in Postgres alongside a role and a set of allowed jurisdictions/schools, and a middleware layer checks every request against it before anything else runs.

**The archival job** will run on its own schedule, separate from the API, and move anything past a configurable age out of hot storage.

**Cold storage** is where that older data ends up — cheap, long-term, and, as Harry confirmed, never read back through the API once it's there.

### How a request moves through the system today

A client sends a write request with a date, jurisdiction, and school code (plus whatever else it wants to include). The API checks those three required fields are present and inserts the record straight into Postgres. A read request comes back through the same API, and if it's paginated, the first page of results fixes a point in time — later pages of that same query stay locked to that point, so a burst of new writes partway through paging never causes records to be skipped or duplicated across pages. That last part sounds like a small detail, but it was one of Harry's specific requirements, and it's already built and covered by a test.

Once auth and the archival pipeline exist, every request will also carry an API key, which the API checks against the key store before doing anything else, and the archival job will quietly move aged-out records to cold storage in the background.

### A note on scope

We looked at a fuller cloud-native version of this — something built around Azure API Management, Event Hubs, Stream Analytics, and so on — and it's a reasonable direction if Daymap ever wanted to run this at full production scale. But Harry told us directly that no cloud deployment is expected this semester, so we're not building toward Azure infrastructure we won't actually get to test or demonstrate. What's described above is what we can build, run locally, and show working.

## 4. Technology Choices

We're building this in **Node.js and TypeScript**. The workload here is mostly a high volume of small, simple requests rather than heavy computation, which is exactly what Node handles well, and TypeScript catches a lot of careless mistakes before the code even runs. For the API layer itself we're using **Express**, which is minimal enough to stay out of the way. Data lives in **PostgreSQL**, which comfortably handles the kind of filtered, indexed queries Harry described and costs nothing to run. We're using **Prisma** to talk to the database, mainly because it keeps our queries type-safe and handles migrations for us. For cold storage, we're starting with plain files on disk and designing it so that swapping in Azure Blob Storage later — Harry's own suggestion — is a small change, not a rewrite. Everything runs locally through **Docker Compose**, so anyone on the team (or Harry) can bring the whole thing up with one command.

## 5. Data Model

```prisma
model Entry {
  id           String   @id @default(uuid())
  sequence     Int      @unique @default(autoincrement())
  date         DateTime
  jurisdiction String
  schoolCode   String
  userId       String?
  extra        Json     @default("{}")
  createdAt    DateTime @default(now())

  @@index([jurisdiction, schoolCode, date])
  @@index([userId])
}
```

`date`, `jurisdiction`, and `schoolCode` are the required fields from the brief. We also gave `userId` its own column, even though it wasn't formally required — Harry mentioned user details show up in almost every entry in practice, and "what did this person access" is a natural question this system needs to answer quickly. Everything else — username, what kind of resource was touched, its name and ID, and anything a school wants to add in future — goes into a flexible `extra` field, which is indexed so it can still be searched without us needing to change the schema every time something new comes up.

## 6. API Endpoints

`POST /entries` accepts a single record or an array of them and is working today. `GET /entries` queries the history, with filtering by jurisdiction, school, user, date range, or any of the arbitrary extra fields, and it's also working today. `POST /api-keys` and `DELETE /api-keys/:id` for creating and revoking keys are designed but not yet built.

One small open item: the endpoints are currently named `/entries`; we should confirm as a team whether we'd rather call them `/audit-events` before this gets locked in further.

## 7. What We Can Actually Demonstrate Right Now

Writing and querying entries both work against a real local Postgres database, including validation that rejects a record missing any required field. Filtering works across every field we've mentioned, including arbitrary ones. The pagination behaviour Harry asked for — later pages ignoring data written after the first page was requested — is built and proven by an automated test, not just assumed to work. There's also a small visual dashboard we can pull up live to write and browse entries during the meeting, rather than only showing raw API calls. Everything currently passes our test suite (11 tests) along with type-checking and linting.

## 8. Delivery Plan

We're using a 9-week structure, matching Harry's stated priorities: get the architecture right first, then a working API against one datastore, then archival, then load testing and polish.

Weeks 1 and 2 covered agreeing the architecture and setting up the repo and dev environment — both done. Weeks 3 and 4 were the write and read endpoints, including pagination — also done. Week 5 is API keys and permissions, which is next. Week 6 is broader integration testing and sample data, alongside a mid-project check-in with Harry. Week 7 is the archival job and cold storage. Week 8 is load testing against the volumes Harry described, plus basic logging. Week 9 wraps up documentation, deployment instructions, and the final demo.

## 9. Preparing for the Meeting

We're bringing this document, a live demo (the dashboard, a real write, a filtered query, and the pagination proof), and a first pass at how we're splitting the remaining work across the team.

**Questions we want to ask Harry:**

1. What retention period should trigger moving data from hot to cold storage — 30 days, 90 days, something else?
2. Do we need more than just read/write permissions — for example, access scoped to a specific jurisdiction, or admin-only key management?
3. Could Civica share a small sample of real audit data, or should we generate our own for now?
4. Is the "action" field (view, create, update, delete) a fixed list, or free text like jurisdiction and school code?
5. Should a single query be able to filter across multiple jurisdictions or schools at once, or is it always scoped to one?
6. Is there an expected response time for queries, particularly the larger ones?
7. Who's expected to create API keys day to day — end users, or only administrators?
8. How will this be assessed at the end of semester — the architecture document, the working demo, or both?
9. What's the best way to keep you updated as we go — regular check-ins, or only when we need input?

**Questions we're expecting from Harry, and how we'd answer them:**

He'll likely ask us to walk through the architecture, which we can do in under two minutes using the diagram above. If he asks why Node.js and Postgres, our answer is that they fit the workload well, TypeScript adds a real safety net, and Postgres handles the query pattern he described without any licensing cost. If he asks how we'll keep ingestion fast under heavy load, the honest answer is that today's version writes directly to Postgres, and the plan for handling much larger bursts is a queue sitting in front of a separate writer process — designed, not yet built. If he asks about permissions, we'll say the model is designed (key, role, allowed jurisdictions and schools) but building it is next on our list. If he asks what happens at very high query volumes, we can point to the pagination work already done and note that full load testing is scheduled for week 8. And if he asks how seven people are splitting the work, that's Section 10 below.

## 10. Who's Doing What

This is a starting point — everyone should feel free to swap tasks based on interest, this isn't set in stone.

**Vishnu and Rahul** are taking API keys and authentication: designing the key table, building the endpoints to create and revoke keys, and writing the middleware that checks every request against a caller's role and allowed jurisdictions.

**Indra and Surbhi** are taking the archival job: working out how the retention window gets configured, building the scheduled process that moves old records out of Postgres, and writing it to disk as cold storage.

**Nivil** is putting together realistic sample data and expanding our integration tests to cover combinations of filters and edge cases, and will help prepare what we actually show Harry at the week 6 check-in.

**Basil** is handling load testing — pushing the write endpoint under a realistic burst of traffic and adding basic logging so we can see how the system behaves under pressure.

**Saichetan** is keeping this document up to date, making sure the different pieces of work actually fit together, staying in touch with Harry between meetings, and pulling together the final documentation and demo in week 9.

## 11. Open Questions and Assumptions

A few things are still unresolved and worth tracking: whether we generate our own sample data or wait for Civica to provide some, the exact retention period before archival, exactly which permission scopes we need, and whether `/entries` or `/audit-events` is the better name for the endpoints. The fuller Azure-based architecture we looked at early on stays on the table as a long-term direction if this ever needs to run at full production scale, but it isn't part of what we're delivering this semester.

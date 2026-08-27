# MG1: Web Application Audit System — Project Plan & Architecture

Prepared for Harry Macheda (Civica/Daymap) by the MG1 team: Saichetan, Vishnu, Rahul, Indra, Surbhi, Nivil, Basil.

## 1. Project Overview

Daymap needs a way to keep a reliable record of who accessed or changed sensitive data across its school-management platform, so that if a compliance investigation ever comes up, there's an accurate history to look back on. We're building that record-keeping system as a standalone service. Other Daymap systems will send it events over a REST API, and it will store and serve that history back on request.

This document sets out the architecture we've decided on, what's already built and working, and our plan for delivering the rest over the coming weeks.

## 2. Requirements

A typical query returns anywhere from a few hundred to a few thousand records, occasionally up to the hundreds of thousands. Tenant and school identifiers are drawn from a fixed list in production but can be treated as plain free text for this project. Audit records will regularly include details about the user involved and about the data being accessed, and Harry shared a real sample export from Daymap's own logging, which we've used directly to shape the data model below. Once data is archived, it doesn't need to be readable through the API again. No cloud deployment is required this semester, a local setup is sufficient. API access is controlled through keys with different permission levels, scoped either to specific schools or to a whole tenant, and the priority is getting the design and architecture right, backed by a real, working API against at least one datastore.

Retention before archival will likely be somewhere between a week and a month in production, and needs to be configurable so testing can use something much shorter.

## 3. Architecture

The system comes down to five pieces. Two of them are built and running today, and the rest are designed and agreed, with a plan for building them over the next few weeks.

![MG1 architecture diagram](assets/architecture.png)

Other systems only ever talk to one thing: the ingest and query API. It checks incoming requests, validates the required fields, and either writes a new record or answers a query. Behind that sits the hot storage, a PostgreSQL database where recent records actually live and where all the searching happens, indexed on the fields people are most likely to search by.

The remaining three pieces are where a record's storage changes over time. An API key store will hold hashed keys in Postgres, each scoped either to one or more specific schools, or to a whole tenant — and a key scoped to a tenant automatically covers every school inside it, since tenants contain schools. That scope is checked before any request is processed. Separate from the API entirely, an archival job will run on its own schedule and move anything past a configurable age out of hot storage. From there it lands in cold storage, cheap and long-term, and never read back through the API once it's there.

### How a request moves through the system today

A client sends a write request with a timestamp, tenant ID, and school ID, plus whatever else it wants to include. The API checks those three required fields are present and inserts the record straight into Postgres. A read request comes back through the same API, and pagination is snapshot-consistent, meaning the first page of a query fixes a point in time, and later pages of that same query stay locked to it. A burst of new writes partway through paging never causes records to be skipped or duplicated.

Once auth and the archival pipeline are in place, every request will also carry an API key, checked against the key store before anything else runs, and the archival job will quietly move aged-out records to cold storage in the background.

### Scope for this semester

A fuller cloud-native version of this, built around services like Azure API Management, Event Hubs, and Stream Analytics, is a reasonable direction for full production scale later on. Since no cloud deployment is required this semester, we're focused on the leaner design above, something we can actually build, run locally, and demonstrate working end to end.

## 4. Technology Choices

We're building this in Node.js and TypeScript. The workload here is mostly a high volume of small, simple requests rather than heavy computation, which is exactly what Node handles well, and TypeScript catches a lot of mistakes before code even runs. For the API layer we're using Express, which is minimal and stays out of the way. Data lives in PostgreSQL, which handles this kind of filtered, indexed querying comfortably and has no licensing cost. We're using Prisma to talk to the database, which keeps queries type-safe and handles migrations for us.

For cold storage, we're starting with plain files on disk, designed so that moving to Azure Blob Storage later is a small change rather than a rewrite. Everything runs locally through Docker Compose, so the whole system comes up with one command on any machine.

## 5. Data Model

```prisma
model Entry {
  id           String   @id @default(uuid())
  sequence     Int      @unique @default(autoincrement())
  eventId      String?
  timestampUtc DateTime
  tenantId     String
  schoolId     String
  userId       String?
  eventType    String?
  entityType   String?
  entityId     String?
  category     String?
  application  String?
  success      Boolean?
  extra        Json     @default("{}")
  createdAt    DateTime @default(now())

  @@index([tenantId, schoolId, timestampUtc])
  @@index([userId])
  @@index([eventType])
  @@index([entityType])
  @@index([application])
  @@index([success])
}
```

Field names here match Daymap's own audit log format directly, based on the sample Harry shared, rather than placeholder names of our own. Timestamp, tenant, and school are the required fields. User ID, event type, entity type, application, and success all get their own indexed columns too, since the sample data shows they show up in almost every entry with a small, predictable set of values, and they're exactly the kind of thing an investigation would search by directly, such as every failed access, or everything read through a particular application. Everything else, including the source format's own data field and anything added in future, goes into a flexible extra field, indexed so it can still be searched without a schema change every time something new comes up.

## 6. API Endpoints

`POST /entries` accepts a single record or an array of them, and is working today. `GET /entries` queries the history, filtering by tenant, school, user, event type, entity type, application, success, date range, or any arbitrary field, and is also working today. Creating and revoking API keys, through `POST /api-keys` and `DELETE /api-keys/:id`, is designed and scheduled next.

## 7. What's Working Today

Writing and querying entries both work against a real local Postgres database, including validation that rejects a record missing any required field. We've tested this directly against a real entry taken from Harry's sample log, not just made-up data. Filtering works across every field mentioned above, including arbitrary ones. Snapshot-consistent pagination is built and proven by an automated test, not just assumed to work. There's also a small visual dashboard for writing and browsing entries directly, rather than only demonstrating this through raw requests. Everything currently passes our test suite of 12 tests, along with type-checking and linting.

## 8. Delivery Plan

We're using a nine-week structure: architecture first, then a working API against one datastore, then archival, then load testing and polish.

Weeks one and two covered agreeing the architecture and setting up the repo and dev environment, both done. Weeks three and four were the write and read endpoints, including pagination, also done. Week five is API keys and permissions. Week six is broader integration testing and sample data, alongside a mid-project check-in. Week seven is the archival job and cold storage. Week eight is load testing against expected query volumes, plus basic logging. Week nine wraps up documentation, deployment instructions, and the final demo.

## 9. Who's Doing What

Vishnu and Rahul are taking API keys and authentication, designing the key table, building the endpoints to create and revoke keys, and writing the middleware that checks every request against a caller's role and scope, whether that's a set of specific schools or a whole tenant.

Indra and Surbhi are taking the archival job, working out how the retention window gets configured, building the scheduled process that moves old records out of Postgres, and writing it to disk as cold storage.

Nivil is putting together realistic sample data and expanding integration tests to cover combinations of filters and edge cases.

Basil is handling load testing, pushing the write endpoint under a realistic burst of traffic and adding basic logging.

Saichetan set the architecture direction and built the initial working prototype, the ingest and query API, the database schema, and the snapshot-consistent pagination described in this document, along with the demo dashboard used to walk through it live. Going forward, Saichetan is coordinating across the team, keeping this document current, staying in touch with Harry, and owns the final documentation and demo in week nine.

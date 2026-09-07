% MG1: Web Application Audit System
% Team Saichetan, Vishnu, Rahul, Indra, Surbhi, Nivil, Basil
% Friday Presentation

# The Problem

- Schools store sensitive student and family data
- If that data is ever exposed or misused, someone needs to answer: **who accessed it, and when?**
- Our job: build a standalone service that records that history, and lets it be searched later

::: notes
Open with the real-world problem before the tech. This is a compliance and security story, not just an API.
:::

# What We're Building

- A REST API that other systems send events to: "who did what, to what, when"
- Two kinds of events: **usage** (viewed a record) and **data changes** (before/after values)
- Queryable history for compliance investigations
- Built as a standalone microservice — plugs into an existing platform, doesn't replace it

# Requirements (Confirmed with the Client)

- Query volume: hundreds to thousands of records typically, occasionally hundreds of thousands
- Records regularly include user details and details of the data accessed
- Archived data never needs to be read back through the API
- No cloud deployment required this semester — local setup is sufficient
- API access controlled via keys with different permission levels
- Priority: architecture and design first, a working API second

# Architecture

![](assets/architecture.png)

::: notes
Walk through this left to right: client apps write and read through the API; the API talks to Postgres directly today; API keys gate every request; archival moves old data to cold storage. Point out what's solid green (built) vs planned.
:::

# Why These Technology Choices

- **Node.js + TypeScript** — fits a workload of many small concurrent requests; TypeScript catches mistakes before code runs
- **PostgreSQL** — handles filtered, indexed queries well; no licensing cost
- **Prisma** — type-safe database access, handles migrations
- Every choice reused the language/tooling we already had hands-on experience delivering with

# Data Model

- Required: **timestamp, tenant ID, school ID**
- Also indexed: user ID, event type, entity type, application, success — common search targets
- Everything else: a flexible field, still searchable, no schema change needed for new fields
- Field names match the client's real audit log format directly, not placeholder names

# API Surface

- `POST /entries` — log one entry or an array of entries
- `GET /entries` — query history, filter by any field, snapshot-consistent pagination
- `POST /api-keys`, `DELETE /api-keys/:id` — create and revoke API keys (admin only)
- `POST /admin/archive`, `GET /admin/cold-storage` — trigger and inspect archival

# API Key Permissions

- Three levels: **read**, **write**, **admin**
- A key can be scoped to a whole tenant (covers every school under it) or to one specific school
- Reads are automatically filtered to what a key is allowed to see — even if the caller doesn't ask for a filter, and even if they explicitly ask for something outside their scope

# A Real Security Bug We Found and Fixed

- A school-scoped key was checked by school ID alone — no check on *which tenant* that school belonged to
- School codes aren't guaranteed unique across different school districts
- **Result:** a key for one district's school could have reached a same-named school under a completely different district
- Found through deliberate testing, fixed by requiring a (tenant, school) pair together, and covered by a dedicated regression test

::: notes
This is worth spending real time on in the presentation — it shows the engineering process working, not just the feature. Emphasize: we tested our own assumptions and caught this before it became a real problem.
:::

# Testing

- 44 automated tests: unit + integration
- Integration tests hit a real database, not mocks
- Coverage includes: permission scoping edge cases, archival correctness, pagination consistency, validation
- Every test proving a security property is one we deliberately tried to break first

# What's Actually Working Today

- Write and query API, fully functional against a real Postgres database
- API key authentication and scoped permissions, enforced on every request
- Archival job — moves old data to cold storage files on a configurable schedule
- A working dashboard to demo all of this live, without needing raw API calls

# Delivery Timeline

- Weeks 1–2: Architecture and design — **done**
- Weeks 3–4: Core write/read API — **done**
- Week 5: API key authentication — **done**
- Week 6: Broader testing and sample data — **done**
- Week 7: Archival job — **done**
- Weeks 8–9: Load testing, final polish, documentation — **in progress**

# Team

- **Vishnu & Rahul** — API keys and authentication
- **Indra & Surbhi** — archival job and cold storage
- **Nivil** — sample data and integration testing
- **Basil** — load testing
- **Saichetan** — architecture, initial prototype, coordination, and client liaison

# Live Demo

- Writing an entry
- A scoped API key seeing only its own tenant's data — with no filter typed
- An admin-only action correctly rejected for a non-admin key
- Archival moving data out of the live database in real time

# Questions

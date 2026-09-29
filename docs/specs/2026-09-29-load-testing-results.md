# Load Testing: Write Endpoint

Prepared for Harry Macheda (Civica/Daymap) by the MG1 team.

## 1. What we tested and why

The write endpoint (`POST /entries`) is the one every other Daymap system talks to continuously, so it's the endpoint most exposed to real concurrent traffic. This round of testing answers three questions: how much sustained concurrent write load can the system take before anything breaks or slows down unacceptably, where does it actually start to strain, and — since a school district generating audit events isn't the same shape of load as a single client hammering one endpoint — does the API's existing batch-write support change the picture.

## 2. Tool and setup

- Tool: [autocannon](https://github.com/mcollina/autocannon) v8, an HTTP load-testing tool for Node.
- Target: `POST /entries` on a locally running instance (Node/Express API + PostgreSQL 16 in Docker, unmodified production configuration unless stated otherwise).
- Each run used a real, admin-scoped API key and wrote real rows to Postgres — every number below came from an actual run, not an estimate.
- Machine: 8-core development laptop. Production hardware will differ; these numbers describe relative behaviour (where the system bends) more than they describe an absolute production ceiling.

## 3. Baseline: single-entry writes, realistic concurrency

**Config:** 50 concurrent connections, 30 seconds, one audit entry per request.

| Metric | Result |
| --- | --- |
| Requests | 66,734 |
| Throughput | 2,225 req/s average |
| Latency p50 | 21 ms |
| Latency p99 | 44 ms |
| Latency max | 157 ms |
| Errors | 0 |
| Non-2xx responses | 0 |

At this concurrency, the system is comfortable: every request succeeded, and p99 latency stayed under 50ms. 50 concurrent sustained writers is already a generous stand-in for real usage — this is well above what a single school district would produce even during a busy period.

## 4. Stress test: pushing concurrency higher

**Config:** 300 concurrent connections, 20 seconds, one audit entry per request.

| Metric | Result |
| --- | --- |
| Requests | 44,202 |
| Throughput | 2,211 req/s average (no increase over the 50-connection run) |
| Latency p50 | 129 ms |
| Latency p99 | 279 ms |
| Latency max | 7,194 ms |
| Errors | 59 (client-side connection resets; zero 5xx from the server) |

Throughput plateaus at roughly the same ~2,200 req/s regardless of how much concurrency is thrown at it — pushing from 50 to 300 connections doesn't move the ceiling, it just makes each request wait longer for its turn, and a handful of client connections eventually gave up waiting.

## 5. Diagnosing the plateau

The first suspect was Prisma's database connection pool, which defaults to a small size (`num_cpus * 2 + 1` — 17 on this machine) when not explicitly configured. We re-ran the 300-connection test with the pool explicitly raised to 50 connections to test that theory.

**Result: this made things worse, not better** — p99 latency rose from 279ms to 1,028ms, and errors rose from 59 to 201. During this run, the Postgres container's CPU usage spiked to 210–255% (across its available cores), which points to the real constraint: Postgres write throughput itself, not the number of connections waiting to use it. `entries` has six indexes maintained on every insert (composite tenant/school/timestamp, plus userId, eventType, entityType, application, success), each of which has to be updated synchronously on every write. Letting more connections queue up in front of that doesn't create more database capacity — it just adds contention. We reverted the pool-size change, since it didn't help.

## 6. What actually fixes it: batched writes

The API already accepts a JSON array in the request body (up to 1,000 entries per call) instead of a single object — this was built for exactly this kind of bulk-ingestion scenario, but hadn't been load tested until now. We re-ran the test sending 100 entries per request instead of one.

**Config:** 50 concurrent connections, 20 seconds, 100 entries per request.

| Metric | Result |
| --- | --- |
| HTTP requests | 7,038 |
| Effective entries written | ~703,800 (confirmed against the database row count) |
| Effective entry throughput | ~35,100 entries/sec |
| Latency p50 | 133 ms |
| Latency p99 | 283 ms |
| Errors | 0 |

Batching 100 entries per call moved effective throughput from ~2,200 entries/sec to ~35,000 entries/sec — roughly a 15x improvement — with zero errors and no meaningful latency cost per call. The bottleneck at high volume wasn't Postgres's raw insert capacity; it was one HTTP request's worth of overhead (parsing, auth, scope-checking) being paid per single row instead of being spread across a batch.

## 7. Conclusion and recommendation

The system comfortably handles realistic single-entry write concurrency (50 sustained concurrent writers, sub-50ms p99, zero errors) without any changes. At higher sustained volume, connection-pool tuning is not the fix and made latency worse when tried — the actual constraint is Postgres write throughput on a single instance. The effective mitigation already exists in the API: **any system expecting to emit audit events in bulk or in bursts should batch multiple entries into a single `POST /entries` call**, which this test shows removes the bottleneck almost entirely. We'd recommend documenting the batch endpoint as the expected integration pattern for any high-volume source system, rather than changing the single-entry path.

No further code changes came out of this round of testing — the batch capability that fixes the observed bottleneck was already built; this testing is what confirmed it actually does the job.

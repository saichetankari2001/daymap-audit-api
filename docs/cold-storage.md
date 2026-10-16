# Cold storage

Entries older than the retention window (`RETENTION_DAYS`, default 30) are moved
out of Postgres by the archival job into plain files on disk.

## Where the files are

The folder set by `COLD_STORAGE_DIR` in `.env` (default `./cold-storage`).

- One file per calendar day, named `YYYY-MM-DD.jsonl`. The day is the entry's own
  `timestampUtc`, not the day it was archived.
- One entry per line, as JSON. Each file can be opened in any text editor.
- The archival job only appends to a day's file, so a day archived in two runs
  ends up with both runs' entries in the same file.

## Reading entries back

The API never reads cold storage. This was a confirmed requirement: archived
data does not need to be queried through the API. For investigations, a
read-only command reads the files directly:

```
npm run cold-storage:read -- --day 2026-09-16
npm run cold-storage:read -- --tenant RiverbendDistrict --limit 10
npm run cold-storage:read -- --school Riverbend-High --event Delete
```

Flags are all optional and can be combined: `--day`, `--tenant`, `--school`,
`--user`, `--event` and `--limit`. Tenant and school matching ignores letter
case, the same as the API. Entries print as one JSON object per line, and a
count is printed at the end.

To save the output to a file in PowerShell:

```
npm run cold-storage:read -- --day 2026-09-16 > entries.jsonl
```

## Limits

- The files sit on the local disk and have no access control of their own.
- Reading scans the day files directly, so a search across many days reads
  every file. Use `--day` when the date is known.
- A line that is not valid JSON (for example after a crash during a write)
  stops the read with the file name and line number.

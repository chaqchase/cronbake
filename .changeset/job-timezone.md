---
"cronbake": minor
---

Add a `timezone` job option that runs a schedule on the clock of an IANA time zone, and an optional `timezone` argument to `Cron.getNext` and `Cron.getPrevious`. The time zone is saved and restored with persisted jobs.

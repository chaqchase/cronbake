---
"cronbake": patch
---

Reject malformed cron fields, out-of-range values, invalid presets, and zero steps before scheduling. Out-of-range values and names such as `MON` used to freeze the process when the job started. Support mixed lists of ranges and steps, normalize whitespace, and return sorted unique field values.

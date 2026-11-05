---
"cronbake": minor
---

A few things behave differently when you upgrade from 0.4:

- `autoStart: true` also starts jobs added after the baker is created, including any `immediate` run. Pass `start: false` to hold one back.
- `overrunProtection: false` now lets runs overlap in the default scheduler mode. In 0.4 they ran one at a time.
- Malformed expressions that 0.4 accepted now throw when the job is created, such as `1.5 * * * * *`, `1,,2 * * * * *`, `*/x * * * * *`, `0 0 12 * * 1#2` and `@every_1_minute`. These ran on a different schedule than they appeared to: `@every_1_minute` ran every second and `1#2` ran every Monday. A saved job with one of these is skipped with a warning when state is restored.
- `Cron.parse` returns field values sorted and without duplicates.

---
"cronbake": patch
---

Fix startup races that overrode `start: false` or restarted stopped jobs, await global async error handlers, and report `onTick` failures in execution metrics. Recheck scheduled wall-clock deadlines, use monotonic execution durations, reject impossible immediate schedules before installing timers, and correctly find previous executions from fractional-second reference dates.

Harden persistence restoration against malformed records, preserve paused status and execution timestamps, copy and validate snapshots, wait for concurrent restores, and protect definitions from partial writes during loading. Serialize Redis writes, isolate file temporary names, and capture file snapshots before queuing. Corrupt storage and read failures now reject instead of looking like missing state; applications should handle `ready()`/`load()` rejections before further persistence changes.

Normalize invalid history, polling, priority, and overflowing delay settings to safe defaults with warnings. Add regression tests and require type checks plus isolated ESM/CommonJS tarball consumer checks in CI and release validation.

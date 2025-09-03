# cronbake

## 0.3.0

### Minor Changes

- Immediate/delayed first run: Add `immediate` and `delay` options so the first callback can run right away or after a configurable delay (e.g., `"10s"`).
- Overrun protection: Add `overrunProtection` (default: true) to skip starting a new run if the previous execution is still running; tracks `skippedExecutions` in metrics.
- Pluggable persistence: Refactor persistence to use providers. Add `FilePersistenceProvider` (JSON on disk) and `RedisPersistenceProvider` (single-key JSON via injected client). New `persistence.strategy` and `persistence.provider` options.

### Features

- New Cron options: `immediate`, `delay`, `overrunProtection`.
- New metrics: `skippedExecutions`.
- New persistence API: `PersistenceProvider` with `save/load` and types for persisted state.
- Export providers from package API: `FilePersistenceProvider`, `RedisPersistenceProvider`.

### Fixes

- Parser: Correct `@on_<day>` mapping to Sunday=0…Saturday=6, fix `@every_<n>_months` to run on day 1 (`0 0 0 1 */n *`), and `@every_<n>_dayOfWeek` to `*/n` on day-of-week.
- Types: Replace `Timer` with `ReturnType<typeof setTimeout|setInterval>` for portability.
- Build: Replace `@/lib` path aliases in source with relative imports to avoid bundler resolution issues.
- Packaging: Set `module` to `dist/index.js`, move `@changesets/cli` to devDependencies, ensure Changesets access is public.

### Tests

- Add tests for immediate/delayed first run and overrun protection.
- Add provider-focused tests and shared test utilities for persistence (file and Redis via a fake client).

## 0.2.0

### Minor Changes

- **Enhanced Job Control**: Added pause and resume functionality for fine-grained job control
- **Job Persistence**: Added support for saving and restoring job state across application restarts
- **Execution Metrics & History**: Comprehensive tracking of job performance including execution counts, success/failure rates, average execution time, and detailed execution history
- **Priority System**: Jobs can now be assigned priority levels for execution ordering
- **Advanced Scheduling**: Added two scheduling modes - calculated timeouts (default) for efficiency and traditional polling-based scheduling
- **Enhanced Error Handling**: Improved error handling with custom error handlers and detailed error tracking
- **Async Callback Support**: Job callbacks now support both synchronous and asynchronous functions
- **Job Metrics API**: New methods to access execution history, performance metrics, and reset statistics
- **Configurable Options**: Enhanced configuration options for polling intervals, history retention, and timeout calculations
- **Type Safety Improvements**: Enhanced TypeScript definitions for better development experience

### Features

- **New Job Control Methods**: `pause()`, `resume()`, `getHistory()`, `getMetrics()`, `resetMetrics()`
- **Persistence Options**: Configurable file-based state persistence with automatic restoration
- **Job Status Tracking**: Extended status states including 'paused' and 'error' states
- **Performance Monitoring**: Track total executions, success/failure counts, execution duration, and error details
- **Priority-based Execution**: Assign and manage job priorities for execution ordering
- **Enhanced Baker Configuration**: New options for scheduler configuration, persistence settings, and global error handling
- **Improved Documentation**: Comprehensive README updates with new feature examples and usage patterns

## 0.1.2

### Patch Changes

- 833dfa8: Update the docs

## 0.1.1

### Patch Changes

- 5ed68b2: Add license and fix readme

## 0.1.0

### Minor Changes

- 3d2e50a: First minor release

## 0.0.1

### Patch Changes

- 6e02baf: Initial release

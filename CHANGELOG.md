# cronbake

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

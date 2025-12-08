# Cronbake - A Powerful and Flexible Cron Job Manager powered by Bun

Cronbake is a powerful and flexible cron job manager built with TypeScript powered by Bun. It provides an easy-to-use interface for scheduling and managing cron jobs with a wide range of options and features. Cronbake is designed to be lightweight, efficient, and highly configurable, making it suitable for a variety of use cases.

### Features

#### Expressive Cron Expressions

Cronbake supports a wide range of cron expressions, including standard formats, ranges, steps, lists, and presets. You can use the following formats or presets:

- **Wildcards**: `* * * * * *` (second minute hour day month day-of-week)
- **Ranges**: `1-10 * * * * *`
- **Steps**: `1-10/2 * * * * *` (can be used with wildcards and ranges)
- **Lists**: `1,2,3 * * * * *`
- **Presets**:
  - `@every_second`
  - `@every_minute`
  - `@yearly` or `@annually`
  - `@monthly`
  - `@weekly`
  - `@daily`
  - `@hourly`
- **Custom Presets**: (as for now you can only use one presets at a time for each cron job in the format of `@<preset>_<value>` the support for multiple presets will be added in the future)
  - `@every_<number>_<unit>` (where `<unit>` is one of `seconds`, `minutes`, `hours`, `dayOfMonth`, `months`, `dayOfWeek`)
  - `@at_<hour>:<minute>` (where `<hour>` is a number between 0 and 23, and `<minute>` is a number between 0 and 59)
  - `@on_<day>` (where `<day>` is one of `sunday`, `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`)
  - `@between_<hour>_<hour>` (where `<hour>` is a number between 0 and 23)

This a simple graph to show how the cron expression works:

```plaintext
* * * * * * (second minute hour day month day-of-week)
| | | | | |
| | | | | +-- day of the week (0 - 6) (Sunday to Saturday)
| | | | +---- month (1 - 12)
| | | +------ day of the month (1 - 31)
| | +-------- hour (0 - 23)
| +---------- minute (0 - 59)
+------------ second (0 - 59)
```

#### Advanced Scheduling

Cronbake provides two scheduling modes for optimal performance:

- **Calculated Timeouts** (default): More efficient scheduling using precise timeout calculations
- **Polling Interval**: Traditional polling-based scheduling with configurable intervals

Additional scheduling controls:

- **Immediate/Delayed First Run**: Run the first callback immediately (`immediate: true`) or after a delay (`delay: '10s'`).
- **Overrun Protection**: Skip new starts if a previous run is still executing (`overrunProtection: true`).

#### Cron Job Management

Cronbake provides a simple and intuitive interface for managing cron jobs. You can easily add, remove, start, stop, pause, resume, and destroy cron jobs using the `Baker` class.

#### Job Status and Control

Cronbake supports comprehensive job control with multiple status states:

- **running**: Job is actively executing
- **stopped**: Job is not executing
- **paused**: Job is temporarily suspended
- **error**: Job encountered an error

#### Real-time Status and Metrics

Cronbake allows you to get the current status, last execution time, next execution time, remaining time, execution history, and comprehensive metrics for each cron job. This information is useful for monitoring, debugging, and performance analysis.

#### Execution History and Metrics

Track detailed execution history and performance metrics including:

- Total executions
- Successful/failed execution counts
- Average execution time
- Execution history with timestamps and durations
- Error tracking and reporting

#### Job Persistence (opt-in)

- Opt in by setting `persistence.enabled: true`
- Use `await baker.ready()` before interacting when `autoRestore` restores jobs for you
- Select file- or Redis-backed providers depending on your environment

#### Callbacks and Error Handling

With Cronbake, you can execute custom functions when a cron job ticks (runs), completes, or encounters errors. Enhanced error handling provides detailed error information and custom error handlers.

#### Priority System

Jobs can be assigned priority levels for execution ordering and resource management.

#### Type-safe

Cronbake is built with TypeScript, ensuring type safety and better tooling support. This helps catch errors during development and provides better code navigation and auto-completion.

#### Async Support

Full support for asynchronous callbacks and Promise-based operations.

### Installation

You can install Cronbake using your preferred package manager:

```bash
# With Bun
bun add cronbake

# With npm
npm install cronbake

# With yarn
yarn add cronbake

# With pnpm
pnpm add cronbake
```

### Quick Start (stateless defaults)

To get started with Cronbake, create a new instance of the `Baker` class and add cron jobs using the `add` method:

```typescript
import Baker from "cronbake";

// Create a new Baker instance
const baker = Baker.create();

// Add a cron job that runs daily at midnight
const dailyJob = baker.add({
  name: "daily-job",
  cron: "0 0 0 * * *", // Runs daily at midnight
  callback: () => {
    console.log("Daily job executed!");
  },
});

// Runs every first 3 minutes for the first 3 hours of every day
const everyFirst3MinutesJob = baker.add({
  name: "every-first-3-minutes-job",
  cron: "0 0-3 1,2,3 * * *", // Runs every first 3 minutes for the first 3 hours of every day
  callback: () => {
    console.log("Every first 3 minutes job executed!");
  },
});

// using custom presets
const everyMinuteJob = baker.add({
  name: "every-minute-job",
  cron: "@every_minute",
  callback: () => {
    console.log("Every minute job executed!");
  },
});

// Start all cron jobs
baker.bakeAll();

// Process exits? No problem—cron definitions live only in memory by default.
// Enable persistence to keep jobs across restarts (see next section).
```

### Persistence & Advanced Controls

When you need your job definitions to survive application restarts, opt into persistence explicitly:

```typescript
import Baker from "cronbake";
import { FilePersistenceProvider } from "cronbake";

const baker = Baker.create({
  persistence: {
    enabled: true,
    strategy: "file",
    provider: new FilePersistenceProvider("./cronbake-state.json"),
    autoRestore: true,
  },
});

await baker.ready(); // wait for autoRestore before interacting with jobs

baker.add({
  name: "daily-job",
  cron: "@daily",
  persist: true, // default when persistence is enabled, but explicit for clarity
  callback: () => console.log("runs daily"),
});

// Jobs with persist: false stay ephemeral even when persistence is on
baker.add({
  name: "one-off",
  cron: "@hourly",
  persist: false,
  callback: () => console.log("won't be restored"),
});
```

### Examples

This repo includes runnable TypeScript scripts under `examples/`. They are excluded from the published package (only `dist/` ships), so you can use them freely as references:

- `examples/basic.ts` – minimal stateless jobs with graceful shutdown
- `examples/persistence.ts` – file-backed persistence plus `await baker.ready()` and mixed `persist` flags

Run them with your favorite TS runner, e.g. `pnpm tsx examples/basic.ts`.

#### Immediate/Delayed First Run and Overrun Protection

```typescript
import Baker from "cronbake";

const baker = Baker.create();

baker.add({
  name: "fast-job",
  cron: "@every_10_seconds",
  immediate: true, // run the first time right away
  delay: "2s", // but wait 2 seconds before that first run
  overrunProtection: true, // skip overlaps if a previous run still executes
  callback: async () => {
    // Do work
  },
});

baker.bakeAll();
```

#### Advanced Configuration

You can configure the Baker with advanced options:

```typescript
import Baker from "cronbake";

const baker = Baker.create({
  autoStart: false,
  enableMetrics: true,
  schedulerConfig: {
    useCalculatedTimeouts: true,
    pollingInterval: 1000,
    maxHistoryEntries: 100,
  },
  persistence: {
    enabled: true,
    filePath: "./cronbake-state.json",
    autoRestore: true,
  },
  onError: (error, jobName) => {
    console.error(`Job ${jobName} failed:`, error.message);
  },
});
```

#### Job Configuration Options

Jobs can be configured with various options:

```typescript
const job = baker.add({
  name: "advanced-job",
  cron: "*/30 * * * * *",
  callback: async () => {
    // Your async job logic here
    await processData();
  },
  onTick: () => {
    console.log("Job started");
  },
  onComplete: () => {
    console.log("Job completed");
  },
  onError: (error) => {
    console.error("Job failed:", error.message);
  },
  priority: 5,
  maxHistory: 50,
  start: true,
  persist: true, // default true when persistence enabled; set false for ephemeral
});
```

#### Job Control and Monitoring

You can manage cron jobs using the various methods provided by the `Baker` class:

```typescript
// Start, stop, pause, and resume jobs
baker.bake("job-name");
baker.stop("job-name");
baker.pause("job-name");
baker.resume("job-name");

// Bulk operations
baker.bakeAll();
baker.stopAll();
baker.pauseAll();
baker.resumeAll();

// Get job information
const status = baker.getStatus("job-name");
const isRunning = baker.isRunning("job-name");
const nextRun = baker.nextExecution("job-name");
const remaining = baker.remaining("job-name");

// Get metrics and history
const metrics = baker.getMetrics("job-name");
const history = baker.getHistory("job-name");

// Job management
const jobNames = baker.getJobNames();
const allJobs = baker.getAllJobs();
```

#### Persistence Operations

Save and restore job state:

```typescript
await baker.ready(); // Wait for autoRestore to finish before inspecting jobs

// Save current state
await baker.saveState();

// Restore from saved state
await baker.restoreState();
```

#### Using a Custom Logger

You can provide a custom logger that implements the `Logger` interface to log messages from Cronbake:

```typescript
import { Baker, Logger } from 'cronbake';

// Using a logging library like logtape
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['myapp', 'cron']);

export const baker = Baker.create({
  logger
});

// Or create a custom logger
const customLogger: Logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  debug: (msg, ...args) => console.debug(`[DEBUG] ${msg}`, ...args),
};

export const bakerWithCustomLogger = Baker.create({
  logger: customLogger
});
```

You can also override the logger per job:

```typescript
const baker = Baker.create({ logger: defaultLogger });

baker.add({
  name: 'special-job',
  cron: '@daily',
  logger: specialLogger, // This job uses a different logger
  callback: () => console.log('Hello!'),
});
```

#### Persistence Providers (File and Redis)

Cronbake uses pluggable providers for persistence. A file provider is included by default. A Redis provider is available; you inject your Redis client.

```typescript
import {
  Baker,
  FilePersistenceProvider,
  RedisPersistenceProvider,
} from "cronbake";

// File-based
const bakerFile = Baker.create({
  persistence: {
    enabled: true,
    strategy: "file",
    provider: new FilePersistenceProvider("./cronbake-state.json"),
    autoRestore: true,
  },
});

// Redis-based (provide your own client implementing get/set)
const redisProvider = new RedisPersistenceProvider({
  client: redisClient,
  key: "cronbake:state",
});
const bakerRedis = Baker.create({
  persistence: {
    enabled: true,
    strategy: "redis",
    provider: redisProvider,
    autoRestore: true,
  },
});
```

### Baker Methods

| Method                                  | Description                                                        |
| --------------------------------------- | ------------------------------------------------------------------ |
| `add(options: CronOptions<T>)`          | Adds a new cron job to the baker.                                  |
| `remove(name: string)`                  | Removes a cron job from the baker.                                 |
| `bake(name: string)`                    | Starts a cron job.                                                 |
| `stop(name: string)`                    | Stops a cron job.                                                  |
| `pause(name: string)`                   | Pauses a cron job.                                                 |
| `resume(name: string)`                  | Resumes a paused cron job.                                         |
| `destroy(name: string)`                 | Destroys a cron job.                                               |
| `getStatus(name: string)`               | Returns the status of a cron job.                                  |
| `isRunning(name: string)`               | Checks if a cron job is running.                                   |
| `lastExecution(name: string)`           | Returns the last execution time of a cron job.                     |
| `nextExecution(name: string)`           | Returns the next execution time of a cron job.                     |
| `remaining(name: string)`               | Returns the remaining time until the next execution of a cron job. |
| `time(name: string)`                    | Returns the remaining time until the next execution.               |
| `getHistory(name: string)`              | Returns the execution history of a cron job.                       |
| `getMetrics(name: string)`              | Returns the metrics of a cron job.                                 |
| `getJobNames()`                         | Returns all cron job names.                                        |
| `getAllJobs()`                          | Returns all cron jobs with their status.                           |
| `bakeAll()`                             | Starts all cron jobs.                                              |
| `stopAll()`                             | Stops all cron jobs.                                               |
| `pauseAll()`                            | Pauses all cron jobs.                                              |
| `resumeAll()`                           | Resumes all cron jobs.                                             |
| `destroyAll()`                          | Destroys all cron jobs.                                            |
| `saveState()`                           | Saves the current state of all jobs to persistence storage.        |
| `restoreState()`                        | Restores jobs from persistence storage.                            |
| `resetAllMetrics()`                     | Resets metrics for all jobs.                                       |
| `static create(options: IBakerOptions)` | Creates a new instance of `Baker`.                                 |

### Advanced Usage

Cronbake also provides a `Cron` class that you can use directly to create and manage individual cron jobs. This can be useful if you need more granular control over cron job instances.

```typescript
import { Cron } from "cronbake";

// Create a new Cron instance
const job = Cron.create({
  name: "custom-job",
  cron: "1-10/2 1,2,3 * * * *", // Runs every 2 seconds in the first 3 minutes of every hour
  callback: () => {
    console.log("Custom job executed!");
  },
  onTick: () => {
    console.log("Job ticked!");
  },
  onComplete: () => {
    console.log("Job completed!");
  },
  onError: (error) => {
    console.error("Job failed:", error.message);
  },
  priority: 10,
  immediate: false,
  overrunProtection: true,
});

// Start the cron job
job.start();
// Pause the cron job
job.pause();
// Resume the cron job
job.resume();
// Stop the cron job
job.stop();
// Get the job status
const status = job.getStatus();
// Get the next execution time
const nextExecution = job.nextExecution();
// Get metrics and history
const metrics = job.getMetrics();
const history = job.getHistory();
// Metrics include skippedExecutions when overrun protection skips overlaps
```

Cronbake also provides utility functions for parsing cron expressions, getting the next or previous execution times, and validating cron expressions.

```typescript
import { Cron } from "cronbake";

// Parse a cron expression
const cronExpression = "0 0 0 * * *";
const cronTime = Cron.parse(cronExpression);
// Get the next execution time for a cron expression
const nextExecution = Cron.getNext(cronExpression);
// Get the previous execution time for a cron expression
const previousExecution = Cron.getPrevious(cronExpression);
// Check if a string is a valid cron expression
const isValid = Cron.isValid(cronExpression); // true
```

### Cron Methods

| Method                                            | Description                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `start()`                                         | Starts the cron job.                                                  |
| `stop()`                                          | Stops the cron job.                                                   |
| `pause()`                                         | Pauses the cron job.                                                  |
| `resume()`                                        | Resumes the cron job.                                                 |
| `getStatus()`                                     | Returns the current status of the cron job.                           |
| `isRunning()`                                     | Checks if the cron job is running.                                    |
| `nextExecution()`                                 | Returns the date of the next execution of the cron job.               |
| `getHistory()`                                    | Returns the execution history of the cron job.                        |
| `getMetrics()`                                    | Returns the metrics of the cron job.                                  |
| `resetMetrics()`                                  | Resets the metrics and history of the cron job.                       |
| `static create(options: CronOptions<T>)`          | Creates a new cron job with the specified options.                    |
| `static parse(cron: CronExpressionType<T>)`       | Parses the specified cron expression and returns a `CronTime` object. |
| `static getNext(cron: CronExpressionType<T>)`     | Gets the next execution time for the specified cron expression.       |
| `static getPrevious(cron: CronExpressionType<T>)` | Gets the previous execution time for the specified cron expression.   |
| `static isValid(cron: CronExpressionType<T>)`     | Checks if the specified string is a valid cron expression.            |

## Contributing

Contributions are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request.

## License

Cronbake is released under the [MIT License](./LICENSE).

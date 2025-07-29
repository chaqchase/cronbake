type CronTime = {
  second?: number[];
  minute?: number[];
  hour?: number[];
  dayOfMonth?: number[];
  month?: number[];
  dayOfWeek?: number[];
};

/**
 * Interface for a cron parser that can parse a cron expression and provide
 * the next and previous execution times.
 */
interface ICronParser {
  /**
   * Parse the cron expression and return a `CronTime` object.
   * @returns A `CronTime` object representing the parsed cron expression.
   */
  parse(): CronTime;

  /**
   * Get the next execution time based on the current time.
   * @returns A `Date` object representing the next execution time.
   */
  getNext(): Date;

  /**
   * Get the previous execution time based on the current time.
   * @returns A `Date` object representing the previous execution time.
   */
  getPrevious(): Date;
}

type unit =
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'dayOfMonth'
  | 'months'
  | 'dayOfWeek';

type day =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

type EveryStrType<U extends unit = unit> = `@every_${string}_${U}`;
type AtHourStrType = `@at_${number}:${number}`;
type OnDayStrType<D extends day = day> = `@on_${D}`;
type BetweenStrType = `@between_${number}_${number}`;

type CronExprs =
  | '@every_second'
  | '@every_minute'
  | '@yearly'
  | '@annually'
  | '@monthly'
  | '@weekly'
  | '@daily'
  | '@hourly'
  | EveryStrType
  | AtHourStrType
  | OnDayStrType
  | BetweenStrType;

type CronStr = `${string} ${string} ${string} ${string} ${string} ${string}`;
type CronExpression = CronExprs | CronStr;

/**
 * A type that takes a string and returns a `CronExprs` type if the string starts with '@',
 * otherwise returns the input string.
 */
type CronExpressionType<T extends string> = T extends `@${infer U}`
  ? CronExprs
  : T;

/**
 * An interface that defines the properties and methods of a cron job.
 * @template T The type of the cron expression.
 */
interface ICron<T extends string = string> {
  /**
   * The name of the cron job.
   */
  name: string;
  /**
   * The cron expression for the job.
   */
  cron: CronExpressionType<T>;
  /**
   * The callback function to execute on each tick of the cron job.
   */
  callback: () => void | Promise<void>;
  /**
   * The function to execute on each tick of the cron job.
   */
  onTick: () => void;
  /**
   * The function to execute when the cron job completes.
   */
  onComplete: () => void;
  /**
   * The function to execute when the cron job encounters an error.
   */
  onError?: (error: Error) => void;
  /**
   * The priority level of the cron job.
   */
  priority: number;
  /**
   * Starts the cron job.
   */
  start: () => void;
  /**
   * Stops the cron job.
   */
  stop: () => void;
  /**
   * Pauses the cron job.
   */
  pause: () => void;
  /**
   * Resumes the cron job.
   */
  resume: () => void;
  /**
   * Destroys the cron job.
   */
  destroy: () => void;
  /**
   * Gets the status of the cron job.
   * @returns The status of the cron job.
   */
  getStatus: () => Status;
  /**
   * Checks if the cron job is running.
   * @returns `true` if the cron job is running, `false` otherwise.
   */
  isRunning: () => boolean;
  /**
   * Gets the date of the last execution of the cron job.
   * @returns The date of the last execution of the cron job.
   */
  lastExecution: () => Date;
  /**
   * Gets the date of the next execution of the cron job.
   * @returns The date of the next execution of the cron job.
   */
  nextExecution: () => Date;
  /**
   * Gets the remaining time until the next execution of the cron job.
   * @returns The remaining time until the next execution of the cron job.
   */
  remaining: () => number;
  /**
   * Gets the time until the next execution of the cron job.
   * @returns The time until the next execution of the cron job.
   */
  time: () => number;
  /**
   * Gets the execution history of the cron job.
   * @returns Array of execution history entries.
   */
  getHistory: () => ExecutionHistory[];
  /**
   * Gets the metrics of the cron job.
   * @returns Job metrics object.
   */
  getMetrics: () => JobMetrics;
  /**
   * Resets the metrics and history of the cron job.
   */
  resetMetrics: () => void;
}

/**
 * A type that defines the options for a cron job.
 * @template T The type of the cron expression.
 */
type CronOptions<T extends string = string> = {
  /**
   * The name of the cron job.
   */
  name: string;
  /**
   * The cron expression for the job.
   * You can use the following formats or you can use a preset
   * @example
   * // wildcards
   * "* * * * * *"
   * // ranges
   * "1-10 * * * * *"
   * // steps
   * "1-10/2 * * * * *" // can be used with wildcards and ranges
   * // lists
   * "1,2,3 * * * * *"
   * // presets
   * "@every_second"
   * "@every_minute"
   * "@yearly"
   * "@annually"
   * "@monthly"
   * "@weekly"
   * "@daily"
   * "@hourly"
   * // custom presets
   * "@every_<number>_<unit>"
   * // where <unit> is one of the following:
   * // "seconds", "minutes", "hours", "dayOfMonth", "months", "dayOfWeek"
   * "@at_<hour>:<minute>"
   * // where <hour> is a number between 0 and 23 and <minute> is a number between 0 and 59
   * "@on_<day>"
   * // where <day> is one of the following:
   * // "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"
   * "@between_<hour>_<hour>"
   * // where hour is a number between 0 and 23
   */
  cron: CronExpressionType<T>;
  /**
   * The callback function to execute on each tick of the cron job.
   */
  callback: () => void | Promise<void>;
  /**
   * The optional function to execute on each tick of the cron job.
   */
  onTick?: () => void;
  /**
   * The optional function to execute when the cron job completes.
   */
  onComplete?: () => void;
  /**
   * The optional function to execute when the cron job encounters an error.
   */
  onError?: (error: Error) => void;
  /**
   * Whether to start the cron job immediately upon creation.
   */
  start?: boolean;
  /**
   * Priority level for job execution (higher numbers = higher priority)
   */
  priority?: number;
  /**
   * Maximum number of execution history entries to keep
   */
  maxHistory?: number;
  /**
   * Whether to persist this job across restarts
   */
  persist?: boolean;
};

type Status = 'running' | 'stopped' | 'paused' | 'error';

/**
 * Execution history entry for a cron job
 */
type ExecutionHistory = {
  timestamp: Date;
  duration: number;
  success: boolean;
  error?: string;
};

/**
 * Job metrics for monitoring and analysis
 */
type JobMetrics = {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionTime?: number;
  lastError?: string;
};

/**
 * Persistence options for cron jobs
 */
type PersistenceOptions = {
  enabled: boolean;
  filePath?: string;
  autoRestore?: boolean;
};

/**
 * Configuration options for the cron scheduler
 */
type SchedulerConfig = {
  pollingInterval?: number;
  useCalculatedTimeouts?: boolean;
  maxHistoryEntries?: number;
};

/**
 * An interface that defines the properties and methods of a baker.
 */
interface IBaker {
  /**
   * Adds a new cron job with the specified options.
   * @returns A new `ICron` object representing the cron job.
   */
  add: (options: CronOptions) => ICron;

  /**
   * Removes the cron job with the specified name.
   */
  remove: (name: string) => void;

  /**
   * Starts the cron job with the specified name.
   */
  bake: (name: string) => void;

  /**
   * Stops baking the cron job with the specified name.
   */
  stop: (name: string) => void;

  /**
   * Pauses the cron job with the specified name.
   */
  pause: (name: string) => void;

  /**
   * Resumes the cron job with the specified name.
   */
  resume: (name: string) => void;

  /**
   * Destroys the cron job with the specified name.
   */
  destroy: (name: string) => void;

  /**
   * Gets the status of the cron job with the specified name.
   * @returns The status of the cron job.
   */
  getStatus: (name: string) => Status;

  /**
   * Checks if the cron job with the specified name is running.
   * @returns `true` if the cron job is running, `false` otherwise.
   */
  isRunning: (name: string) => boolean;

  /**
   * Gets the date of the last execution of the cron job with the specified name.
   * @returns The date of the last execution of the cron job.
   */
  lastExecution: (name: string) => Date;

  /**
   * Gets the date of the next execution of the cron job with the specified name.
   * @returns The date of the next execution of the cron job.
   */
  nextExecution: (name: string) => Date;

  /**
   * Gets the remaining time until the next execution of the cron job with the specified name.
   * @returns The remaining time until the next execution of the cron job.
   */
  remaining: (name: string) => number;

  /**
   * Gets the time until the next execution of the cron job with the specified name.
   * @returns The time until the next execution of the cron job.
   */
  time: (name: string) => number;

  /**
   * Gets the execution history of the cron job with the specified name.
   * @returns Array of execution history entries.
   */
  getHistory: (name: string) => ExecutionHistory[];

  /**
   * Gets the metrics of the cron job with the specified name.
   * @returns Job metrics object.
   */
  getMetrics: (name: string) => JobMetrics;

  /**
   * Gets all cron job names.
   * @returns Array of job names.
   */
  getJobNames: () => string[];

  /**
   * Gets all cron jobs with their status.
   * @returns Map of job names to their cron instances.
   */
  getAllJobs: () => Map<string, ICron>;

  /**
   * Starts all cron jobs.
   */
  bakeAll: () => void;

  /**
   * Stops all cron jobs.
   */
  stopAll: () => void;

  /**
   * Pauses all cron jobs.
   */
  pauseAll: () => void;

  /**
   * Resumes all cron jobs.
   */
  resumeAll: () => void;

  /**
   * Destroys all cron jobs.
   */
  destroyAll: () => void;

  /**
   * Saves the current state of all jobs to persistence storage.
   */
  saveState: () => Promise<void>;

  /**
   * Restores jobs from persistence storage.
   */
  restoreState: () => Promise<void>;

  /**
   * Resets metrics for all jobs.
   */
  resetAllMetrics: () => void;
}

interface IBakerOptions {
  autoStart?: boolean;
  schedulerConfig?: SchedulerConfig;
  persistence?: PersistenceOptions;
  enableMetrics?: boolean;
  onError?: (error: Error, jobName: string) => void;
}

export {
  type CronTime,
  type ICronParser,
  type CronExpression,
  type CronExpressionType,
  type EveryStrType,
  type AtHourStrType,
  type OnDayStrType,
  type BetweenStrType,
  type unit,
  type day,
  type CronExprs,
  type ICron,
  type CronOptions,
  type Status,
  type IBaker,
  type IBakerOptions,
  type ExecutionHistory,
  type JobMetrics,
  type PersistenceOptions,
  type SchedulerConfig,
};

import {
  type CronExpressionType,
  type CronOptions,
  type CronTime,
  type ICron,
  type ICronParser,
  type Status,
  type ExecutionHistory,
  type JobMetrics,
  type Logger,
} from "./types";
import CronParser from "./parser";
import { CBResolver, resolveIfPromise } from "./utils";

/**
 * A class that implements the `ICron` interface and provides methods manage a cron job.
 */
class Cron<T extends string = string> implements ICron<T> {
  name: string;
  cron: CronExpressionType<T>;
  callback: () => void | Promise<void>;
  onTick: () => void;
  onComplete: () => void;
  onError?: (error: Error) => void;
  priority: number;
  timezone?: string;
  private interval: ReturnType<typeof setInterval> | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private next: Date | null = null;
  private status: Status = "stopped";
  private parser: ICronParser;
  private history: ExecutionHistory[] = [];
  private metrics: JobMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
  };
  private maxHistory: number;
  private useCalculatedTimeouts: boolean;
  private pollingInterval: number;
  private overrunProtection: boolean;
  private activeExecutions = 0;
  private generation = 0;
  private immediate: boolean;
  private initialDelayMs?: number;
  private lastRunTime: Date | null = null;
  private logger: Logger;

  /**
   * Creates a new instance of the `Cron` class.
   */
  constructor(
    options: CronOptions<T>,
    config?: { useCalculatedTimeouts?: boolean; pollingInterval?: number }
  ) {
    if (!options.name || typeof options.name !== "string") {
      throw new Error("Cron job name is required and must be a string");
    }

    this.logger = options.logger ?? console;
    this.name = options.name;
    this.cron = options.cron;
    this.callback = options.callback;
    this.onTick = CBResolver.bind(this, options.onTick, undefined, this.logger);
    this.onComplete = CBResolver.bind(this, options.onComplete, undefined, this.logger);
    this.onError = options.onError;
    this.priority = options.priority ?? 0;
    this.maxHistory = options.maxHistory ?? 100;
    this.useCalculatedTimeouts = config?.useCalculatedTimeouts ?? true;
    this.pollingInterval = config?.pollingInterval ?? 1000;
    this.overrunProtection = options.overrunProtection ?? true;
    this.immediate = options.immediate ?? false;
    this.initialDelayMs = this.parseDelay(options.delay);
    // These warn instead of throwing: 0.4.0 accepted them, and a job that started then should still start.
    // A missing callback is fine: a job can run on its onTick hook alone.
    if (this.callback && typeof this.callback !== "function") this.warnAboutOption("callback", "isn't a function, so its runs will fail");
    if (!Number.isInteger(this.maxHistory) || this.maxHistory < 0) this.warnAboutOption("maxHistory", "should be a whole number of at least 0");
    if (!Number.isFinite(this.pollingInterval) || this.pollingInterval <= 0 || this.pollingInterval > 2147483647) {
      this.warnAboutOption("pollingInterval", "should be between 1 and 2147483647 ms");
    }
    if (!Number.isFinite(this.priority)) this.warnAboutOption("priority", "should be a number");

    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.pause = this.pause.bind(this);
    this.resume = this.resume.bind(this);
    this.destroy = this.destroy.bind(this);
    this.getStatus = this.getStatus.bind(this);
    this.isRunning = this.isRunning.bind(this);
    this.lastExecution = this.lastExecution.bind(this);
    this.nextExecution = this.nextExecution.bind(this);
    this.remaining = this.remaining.bind(this);
    this.time = this.time.bind(this);
    this.getHistory = this.getHistory.bind(this);
    this.getMetrics = this.getMetrics.bind(this);
    this.resetMetrics = this.resetMetrics.bind(this);

    this.timezone = options.timezone;
    this.parser = new CronParser(this.cron, this.timezone);
    this.validateCronExpression();

    if (options.start) {
      this.start();
    }
  }

  /**
   * Validates the cron expression and custom preset bounds
   */
  private validateCronExpression(): void {
    if (typeof this.cron === "string") {
      if (this.cron.includes("@every_")) {
        const parts = this.cron.split("_");
        if (parts.length >= 3) {
          const value = parseInt(parts[1]);
          if (isNaN(value) || value <= 0) {
            throw new Error(`Invalid value in custom preset: ${this.cron}`);
          }
        }
      }

      if (this.cron.includes("@at_")) {
        const timeMatch = this.cron.match(/@at_(\d+):(\d+)/);
        if (timeMatch) {
          const hour = parseInt(timeMatch[1]);
          const minute = parseInt(timeMatch[2]);
          if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            throw new Error(`Invalid time in custom preset: ${this.cron}`);
          }
        }
      }

      if (this.cron.includes("@between_")) {
        const betweenMatch = this.cron.match(/@between_(\d+)_(\d+)/);
        if (betweenMatch) {
          const start = parseInt(betweenMatch[1]);
          const end = parseInt(betweenMatch[2]);
          if (start < 0 || start > 23 || end < 0 || end > 23 || start >= end) {
            throw new Error(
              `Invalid hour range in custom preset: ${this.cron}`
            );
          }
        }
      }
    }

    try {
      this.parser.parse();
    } catch (error) {
      throw new Error(`Invalid cron expression: ${this.cron}`);
    }
  }

  start(): void {
    if (this.status === "running") {
      return;
    }
    this.next = this.immediate ? new Date(Date.now() + (this.initialDelayMs ?? 0)) : this.parser.getNext();
    this.status = "running";

    if (this.immediate) {
      this.scheduleImmediateFirstRun();
      return;
    }

    this.next = this.parser.getNext();
    if (this.useCalculatedTimeouts) {
      this.scheduleWithTimeout();
    } else {
      this.scheduleWithInterval();
    }
  }

  /**
   * Schedules execution using calculated timeouts for better efficiency
   */
  private scheduleWithTimeout(): void {
    if (this.status !== "running" || !this.next) return;

    const delay = Math.max(0, this.next.getTime() - Date.now());

    // JavaScript setTimeout has a maximum safe value of 2^31-1 (2147483647ms)
    // If the delay exceeds this, fall back to polling approach
    const MAX_TIMEOUT_VALUE = 2147483647;

    if (delay > MAX_TIMEOUT_VALUE) {
      // For very long delays, use polling instead
      // Clear any existing timeout first
      if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
      }
      this.scheduleWithInterval();
      return;
    }

    const generation = this.generation;
    this.timeout = setTimeout(() => {
      if (this.status !== "running" || generation !== this.generation) return;
      this.next = this.parser.getNext();
      this.scheduleWithTimeout();
      void this.executeJob();
    }, delay);
  }

  private scheduleImmediateFirstRun(): void {
    const generation = this.generation;
    const target = this.next!.getTime();
    const schedule = () => {
      this.timeout = setTimeout(() => {
        if (this.status !== "running" || generation !== this.generation) return;
        if (Date.now() < target) { schedule(); return; }
        this.next = this.parser.getNext();
        if (this.useCalculatedTimeouts) this.scheduleWithTimeout();
        else this.scheduleWithInterval();
        void this.executeJob();
      }, Math.min(Math.max(0, target - Date.now()), 2147483647));
    };
    schedule();
  }

  private scheduleWithInterval(): void {
    const generation = this.generation;
    this.interval = setInterval(() => {
      if (this.status !== "running" || generation !== this.generation) return;
      if (this.next && this.next.getTime() <= Date.now()) {
        this.next = this.parser.getNext();
        void this.executeJob();
      }
    }, this.pollingInterval);
  }

  /**
   * Executes the job and handles metrics/history tracking
   */
  private async executeJob(): Promise<void> {
    if (this.overrunProtection && this.activeExecutions > 0) {
      this.metrics.skippedExecutions = (this.metrics.skippedExecutions ?? 0) + 1;
      return;
    }
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;
    this.activeExecutions++;

    try {
      if (this.callback) {
        await resolveIfPromise(this.callback());
      }
      await this.onTick();
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);

      if (this.onError) {
        try {
          await this.onError(err instanceof Error ? err : new Error(String(err)));
        } catch (handlerError) {
          this.logger.warn("Error handler failed:", handlerError);
        }
      } else {
        this.logger.warn(`Cron job '${this.name}' failed:`, err);
      }
      this.metrics.lastError = error;
    } finally {
      this.activeExecutions--;
    }

    const duration = Date.now() - startTime;
    this.metrics.totalExecutions++;
    if (success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }
    this.metrics.lastExecutionTime = duration;
    this.metrics.averageExecutionTime =
      (this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1) +
        duration) /
      this.metrics.totalExecutions;

    const historyEntry: ExecutionHistory = {
      timestamp: new Date(startTime),
      duration,
      success,
      error,
    };

    this.history.unshift(historyEntry);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }
    this.lastRunTime = historyEntry.timestamp;
  }

  stop(): void {
    if (this.status === "stopped") {
      return;
    }
    this.status = "stopped";
    this.clearSchedulers();
  }

  pause(): void {
    if (this.status !== "running") {
      return;
    }
    this.status = "paused";
    this.clearSchedulers();
  }

  resume(): void {
    if (this.status !== "paused") {
      return;
    }
    this.status = "running";
    this.next = this.parser.getNext();

    if (this.useCalculatedTimeouts) {
      this.scheduleWithTimeout();
    } else {
      this.scheduleWithInterval();
    }
  }

  /**
   * Clears all active schedulers
   */
  private clearSchedulers(): void {
    this.generation++;
    this.next = null;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  destroy(): void {
    this.clearSchedulers();
    this.status = "stopped";
    this.onComplete();
  }

  getStatus(): Status {
    return this.status;
  }

  isRunning(): boolean {
    return this.status === "running";
  }

  lastExecution(): Date {
    return this.lastRunTime
      ? new Date(this.lastRunTime)
      : this.parser.getPrevious();
  }

  nextExecution(): Date {
    return this.next ? new Date(this.next) : new Date();
  }

  remaining(): number {
    return this.next ? this.next.getTime() - Date.now() : 0;
  }

  time(): number {
    return this.remaining();
  }

  getHistory(): ExecutionHistory[] {
    return this.history.map(entry => ({ ...entry, timestamp: new Date(entry.timestamp) }));
  }

  getMetrics(): JobMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.history = [];
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
    };
  }

  hydratePersistence(state: {
    history?: ExecutionHistory[];
    metrics?: JobMetrics;
  }): void {
    if (state.history) {
      this.history = state.history.slice(0, this.maxHistory);
    }
    if (state.metrics) {
      this.metrics = { ...state.metrics };
    }
  }

  /** Parse a human-friendly delay string or number into milliseconds */
  private warnAboutOption(option: string, problem: string): void {
    this.logger.warn(`Job '${this.name}': ${option} ${problem}`);
  }

  private parseDelay(delay?: number | string): number | undefined {
    if (delay === undefined || delay === null) return undefined;
    if (typeof delay === "number") {
      if (Number.isFinite(delay) && delay >= 0) return delay;
      this.warnAboutOption("delay", "should be 0 or more, so it won't delay the first run");
      return 0;
    }
    const str = String(delay).trim().toLowerCase();
    const match = str.match(/^(\d+)\s*(ms|s|m|h|d)?$/);
    if (!match) {
      this.warnAboutOption("delay", "isn't a number or a duration such as 30s, so it won't delay the first run");
      return undefined;
    }
    const value = parseInt(match[1], 10);
    const unit = match[2] ?? "ms";
    const factor =
      unit === "ms"
        ? 1
        : unit === "s"
        ? 1000
        : unit === "m"
        ? 60000
        : unit === "h"
        ? 3600000
        : 86400000;
    if (!Number.isSafeInteger(value * factor)) this.warnAboutOption("delay", "is too large to schedule");
    return value * factor;
  }

  /**
   * Creates a new cron job with the specified options.
   * @returns A new `ICron` object representing the cron job.
   */
  static create<T extends string = string>(
    options: CronOptions<T>,
    config?: { useCalculatedTimeouts?: boolean; pollingInterval?: number }
  ): ICron<T> {
    return new Cron(options, config);
  }

  /**
   * Parses the specified cron expression and returns a `CronTime` object.
   * @returns A `CronTime` object representing the parsed cron expression.
   */
  static parse<T extends string = string>(
    cron: CronExpressionType<T>
  ): CronTime {
    return new CronParser(cron).parse();
  }

  /**
   * Gets the next execution time for the specified cron expression.
   * @template T The type of the cron expression.
   * @returns A `Date` object representing the next execution time.
   */
  static getNext<T extends string = string>(
    cron: CronExpressionType<T>, from?: Date, timezone?: string
  ): Date {
    return new CronParser(cron, timezone).getNext(from);
  }

  /**
   * Gets the previous execution time for the specified cron expression.
   * @returns A `Date` object representing the previous execution time.
   */
  static getPrevious<T extends string = string>(
    cron: CronExpressionType<T>, from?: Date, timezone?: string
  ): Date {
    return new CronParser(cron, timezone).getPrevious(from);
  }

  /**
   * Checks if the specified string is a valid cron expression.
   * @returns `true` if the string is a valid cron expression, `false` otherwise.
   */
  static isValid<T extends string = string>(
    cron: CronExpressionType<T>
  ): boolean {
    try {
      new CronParser(cron).parse();
      return true;
    } catch (e) {
      return false;
    }
  }
}

export default Cron;

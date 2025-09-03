import {
  type CronExpressionType,
  type CronOptions,
  type CronTime,
  type ICron,
  type ICronParser,
  type Status,
  type ExecutionHistory,
  type JobMetrics,
} from "./types";
import CronParser from "./parser";
import { CBResolver } from "./utils";

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
  private isExecuting: boolean = false;
  private immediate: boolean;
  private initialDelayMs?: number;

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

    this.name = options.name;
    this.cron = options.cron;
    this.callback = options.callback;
    this.onTick = CBResolver.bind(this, options.onTick);
    this.onComplete = CBResolver.bind(this, options.onComplete);
    this.onError = options.onError;
    this.priority = options.priority ?? 0;
    this.maxHistory = options.maxHistory ?? 100;
    this.useCalculatedTimeouts = config?.useCalculatedTimeouts ?? true;
    this.pollingInterval = config?.pollingInterval ?? 1000;
    this.overrunProtection = options.overrunProtection ?? true;
    this.immediate = options.immediate ?? false;
    this.initialDelayMs = this.parseDelay(options.delay);

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

    this.parser = new CronParser(this.cron);
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

    this.timeout = setTimeout(async () => {
      if (this.status === "running") {
        await this.executeJob();
        this.next = this.parser.getNext();
        this.scheduleWithTimeout();
      }
    }, delay);
  }

  /**
   * Schedule a one-off immediate or delayed first run, then fall back to normal scheduling
   */
  private scheduleImmediateFirstRun(): void {
    if (this.status !== "running") return;
    const targetDelay = Math.max(0, this.initialDelayMs ?? 0);
    const MAX_TIMEOUT_VALUE = 2147483647; // ~24.8 days

    if (targetDelay > MAX_TIMEOUT_VALUE) {
      const targetTime = Date.now() + targetDelay;
      this.interval = setInterval(async () => {
        if (this.status !== "running") return;
        if (Date.now() >= targetTime) {
          if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
          }
          await this.executeJob();
          this.next = this.parser.getNext();
          if (this.useCalculatedTimeouts) this.scheduleWithTimeout();
          else this.scheduleWithInterval();
        }
      }, Math.min(this.pollingInterval, 1000));
      return;
    }

    this.timeout = setTimeout(async () => {
      if (this.status !== "running") return;
      await this.executeJob();
      this.next = this.parser.getNext();
      if (this.useCalculatedTimeouts) this.scheduleWithTimeout();
      else this.scheduleWithInterval();
    }, targetDelay);
  }

  /**
   * Schedules execution using traditional polling interval
   */
  private scheduleWithInterval(): void {
    this.interval = setInterval(async () => {
      if (this.overrunProtection && this.isExecuting) {
        // Overrun protection: skip overlapping start
        this.metrics.skippedExecutions = (this.metrics.skippedExecutions ?? 0) + 1;
        return;
      }

      if (this.next && this.next.getTime() <= Date.now() && this.status === "running") {
        await this.executeJob();
        this.next = this.parser.getNext();
      }
    }, this.pollingInterval);
  }

  /**
   * Executes the job and handles metrics/history tracking
   */
  private async executeJob(): Promise<void> {
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;
    this.isExecuting = true;

    try {
      await CBResolver(this.callback, this.onError);
      this.onTick();
      this.metrics.successfulExecutions++;
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      this.metrics.failedExecutions++;
      this.metrics.lastError = error;

      if (this.onError) {
        try {
          this.onError(err instanceof Error ? err : new Error(String(err)));
        } catch (handlerError) {
          console.warn("Error handler failed:", handlerError);
        }
      }
    }
    finally {
      this.isExecuting = false;
    }

    const duration = Date.now() - startTime;
    this.metrics.totalExecutions++;
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
    return this.parser.getPrevious();
  }

  nextExecution(): Date {
    return this.next || new Date();
  }

  remaining(): number {
    return this.next ? this.next.getTime() - Date.now() : 0;
  }

  time(): number {
    return Date.now();
  }

  getHistory(): ExecutionHistory[] {
    return [...this.history];
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

  /** Parse a human-friendly delay string or number into milliseconds */
  private parseDelay(delay?: number | string): number | undefined {
    if (delay === undefined || delay === null) return undefined;
    if (typeof delay === "number") return delay >= 0 ? delay : 0;
    const str = String(delay).trim().toLowerCase();
    const match = str.match(/^(\d+)\s*(ms|s|m|h|d)?$/);
    if (!match) return undefined;
    const value = parseInt(match[1], 10);
    const unit = match[2] ?? "ms";
    const factor = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60000 : unit === "h" ? 3600000 : 86400000;
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
  static getNext<T extends string = string>(cron: CronExpressionType<T>): Date {
    return new CronParser(cron).getNext();
  }

  /**
   * Gets the previous execution time for the specified cron expression.
   * @returns A `Date` object representing the previous execution time.
   */
  static getPrevious<T extends string = string>(
    cron: CronExpressionType<T>
  ): Date {
    return new CronParser(cron).getPrevious();
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

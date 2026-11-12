import Cron from "./cron";
import {
  CronOptions,
  IBaker,
  IBakerOptions,
  ICron,
  Status,
  ExecutionHistory,
  JobMetrics,
  SchedulerConfig,
  PersistenceOptions,
  Logger,
} from "./types";
import { FilePersistenceProvider } from "./persistence/file";
import type { PersistenceProvider } from "./persistence/types";

/**
 * A class that implements the `IBaker` interface and provides methods to manage cron jobs.
 */
class Baker implements IBaker {
  private crons: Map<string, ICron> = new Map();
  private restoredJobs: Set<string> = new Set();
  private jobPersistence: Map<string, boolean> = new Map();
  private isRestoring = false;
  private restorePromise?: Promise<void>;
  private pendingStarts = new Map<string, ICron>();
  private changedDuringRestore = false;
  private restoreGeneration = 0;
  private removedDuringRestore = new Set<string>();
  private initialRestorePromise: Promise<void> = Promise.resolve();
  private config: SchedulerConfig;
  private persistence: PersistenceOptions;
  private persistenceProvider?: PersistenceProvider;
  private enableMetrics: boolean;
  private autoStart: boolean;
  private saveQueue: Promise<void> = Promise.resolve();
  private onError?: (error: Error, jobName: string) => void;
  private logger: Logger;

  constructor(options: IBakerOptions = {}) {
    this.logger = options.logger ?? console;
    this.autoStart = options.autoStart ?? false;
    this.config = {
      pollingInterval: options.schedulerConfig?.pollingInterval ?? 1000,
      useCalculatedTimeouts:
        options.schedulerConfig?.useCalculatedTimeouts ?? true,
      maxHistoryEntries: options.schedulerConfig?.maxHistoryEntries ?? 100,
    };

    this.persistence = {
      enabled: options.persistence?.enabled ?? false,
      filePath: options.persistence?.filePath ?? "./cronbake-state.json",
      autoRestore: options.persistence?.autoRestore ?? true,
      strategy: options.persistence?.strategy ?? "file",
      provider: options.persistence?.provider,
      redis: options.persistence?.redis,
    };

    if (this.persistence.enabled) {
      if (this.persistence.provider) {
        this.persistenceProvider = this.persistence.provider;
      } else if (this.persistence.strategy === "file") {
        this.persistenceProvider = new FilePersistenceProvider(
          this.persistence.filePath!
        );
      } else if (this.persistence.strategy === "redis") {
        throw new Error(
          "Redis persistence selected but no provider supplied. Pass persistence.provider or use FilePersistenceProvider."
        );
      }
    }

    this.enableMetrics = options.enableMetrics ?? true;
    this.onError = options.onError;

    if (this.persistence.enabled && this.persistence.autoRestore) {
      const restorePromise = this.restoreState();
      restorePromise.catch((err) => {
        this.logger.warn("Failed to restore state:", err);
      });
      this.initialRestorePromise = restorePromise;
    }
  }

  add<T extends string = string>(options: CronOptions<T>): ICron<T> {
    const existingCron = this.crons.get(options.name);
    if (existingCron && !this.restoredJobs.has(options.name)) {
      throw new Error(`Cron job with name '${options.name}' already exists`);
    }

    const cronConfig = {
      useCalculatedTimeouts: this.config.useCalculatedTimeouts,
      pollingInterval: this.config.pollingInterval,
    };

    const jobLogger = options.logger ?? this.logger;

    const enhancedOptions: CronOptions<T> = {
      ...options,
      start: !this.isRestoring && (options.start ?? this.autoStart),
      maxHistory: options.maxHistory ?? this.config.maxHistoryEntries,
      logger: jobLogger,
      onError:
        options.onError ??
        ((error: Error) => {
          if (this.onError) {
            return this.onError(error, options.name);
          } else {
            jobLogger.warn(`Cron job '${options.name}' failed:`, error);
          }
        }),
    };

    // Construct successfully before discarding a restored definition.
    const cron = Cron.create(enhancedOptions, cronConfig);
    if (existingCron) {
      existingCron.destroy();
      this.restoredJobs.delete(options.name);
    }
    if (this.isRestoring && (options.start ?? this.autoStart)) {
      this.pendingStarts.set(cron.name, cron);
    }
    const shouldPersist = options.persist ?? true;
    this.jobPersistence.set(cron.name, shouldPersist);
    this.crons.set(cron.name, cron);

    this.persistChange();
    return cron;
  }

  remove(name: string): void {
    this.pendingStarts.delete(name);
    if (this.isRestoring) {
      this.removedDuringRestore.add(name);
      this.changedDuringRestore = true;
    }
    const cron = this.crons.get(name);
    if (cron) {
      cron.destroy();
      this.crons.delete(name);
      this.restoredJobs.delete(name);
      this.jobPersistence.delete(name);

      this.persistChange();
    }
  }

  bake(name: string): void {
    const cron = this.crons.get(name);
    if (cron) {
      cron.start();
    }
  }

  stop(name: string): void {
    this.pendingStarts.delete(name);
    const cron = this.crons.get(name);
    if (cron) {
      cron.stop();
    }
  }

  pause(name: string): void {
    this.pendingStarts.delete(name);
    const cron = this.crons.get(name);
    if (cron) {
      cron.pause();
    }
  }

  resume(name: string): void {
    const cron = this.crons.get(name);
    if (cron) {
      cron.resume();
    }
  }

  destroy(name: string): void {
    this.remove(name);
  }

  getStatus(name: string): Status {
    const cron = this.crons.get(name);
    return cron ? cron.getStatus() : "stopped";
  }

  isRunning(name: string): boolean {
    const cron = this.crons.get(name);
    return cron ? cron.isRunning() : false;
  }

  lastExecution(name: string): Date {
    const cron = this.crons.get(name);
    return cron ? cron.lastExecution() : new Date();
  }

  nextExecution(name: string): Date {
    const cron = this.crons.get(name);
    return cron ? cron.nextExecution() : new Date();
  }

  remaining(name: string): number {
    const cron = this.crons.get(name);
    return cron ? cron.remaining() : 0;
  }

  time(name: string): number {
    const cron = this.crons.get(name);
    return cron ? cron.time() : 0;
  }

  getHistory(name: string): ExecutionHistory[] {
    const cron = this.crons.get(name);
    return cron && this.enableMetrics ? cron.getHistory() : [];
  }

  getMetrics(name: string): JobMetrics {
    const cron = this.crons.get(name);
    return cron && this.enableMetrics
      ? cron.getMetrics()
      : {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          averageExecutionTime: 0,
        };
  }

  getJobNames(): string[] {
    return Array.from(this.crons.keys());
  }

  getAllJobs(): Map<string, ICron> {
    return new Map(this.crons);
  }

  bakeAll(): void {
    [...this.crons.values()].sort((a, b) => b.priority - a.priority).forEach((cron) => cron.start());
  }

  stopAll(): void {
    this.pendingStarts.clear();
    this.crons.forEach((cron) => cron.stop());
  }

  pauseAll(): void {
    this.pendingStarts.clear();
    this.crons.forEach((cron) => cron.pause());
  }

  resumeAll(): void {
    this.crons.forEach((cron) => cron.resume());
  }

  destroyAll(): void {
    this.restoreGeneration++;
    this.pendingStarts.clear();
    this.crons.forEach((cron) => cron.destroy());
    this.crons.clear();
    this.restoredJobs.clear();
    this.jobPersistence.clear();

    this.persistChange();
  }

  private persistChange(): void {
    if (!this.persistence.enabled) return;
    if (this.isRestoring) {
      this.changedDuringRestore = true;
      return;
    }
    void this.saveState().catch(err => this.logger.warn("Failed to save state:", err));
  }

  resetAllMetrics(): void {
    if (this.enableMetrics) {
      this.crons.forEach((cron) => cron.resetMetrics());
    }
  }

  async saveState(): Promise<void> {
    if (!this.persistence.enabled || !this.persistenceProvider) return;
    // Don't replace stored definitions with a partial view while loading them.
    if (this.restorePromise) await this.restorePromise;
    try {
      const jobs = Array.from(this.crons.entries())
        .filter(([name]) => this.jobPersistence.get(name) !== false)
        .map(([name, cron]) => ({
          name,
          cron: String(cron.cron),
          timezone: cron.timezone,
          status: cron.getStatus(),
          priority: cron.priority,
          persist: this.jobPersistence.get(name) !== false,
          metrics: this.enableMetrics ? cron.getMetrics() : undefined,
          history: this.enableMetrics
            ? cron.getHistory().map((entry) => ({
                ...entry,
                timestamp: entry.timestamp.toISOString(),
              }))
            : undefined,
        }));
      const state = {
        version: 1,
        timestamp: new Date().toISOString(),
        jobs,
        config: this.config,
      } as const;
      const provider = this.persistenceProvider;
      const write = () => provider.save(state);
      this.saveQueue = this.saveQueue.then(write, write);
      await this.saveQueue;
    } catch (error) {
      throw new Error(`Failed to save state: ${error}`);
    }
  }

  restoreState(): Promise<void> {
    if (!this.persistence.enabled || !this.persistenceProvider) return Promise.resolve();
    if (this.restorePromise) return this.restorePromise;
    this.isRestoring = true;
    let loaded = false;
    this.restorePromise = this.loadState().then(() => { loaded = true; }).finally(() => {
      this.isRestoring = false;
      this.restorePromise = undefined;
      const pending = [...this.pendingStarts.values()].sort((a, b) => b.priority - a.priority);
      this.pendingStarts.clear();
      this.removedDuringRestore.clear();
      for (const cron of pending) {
        try { cron.start(); }
        catch (error) { this.logger.warn(`Failed to start job '${cron.name}':`, error); }
      }
      if (this.changedDuringRestore) {
        this.changedDuringRestore = false;
        // A failed load must not overwrite stored jobs with our incomplete view.
        if (loaded) this.persistChange();
      }
    });
    return this.restorePromise;
  }

  private async loadState(): Promise<void> {
    const generation = this.restoreGeneration;
    try {
      const state = await this.persistenceProvider!.load();
      if (!state || generation !== this.restoreGeneration) return;
      if (state.version !== 1 || !Array.isArray(state.jobs)) {
        throw new Error("Invalid or unsupported state format");
      }
      let restoredCount = 0;
      for (const jobData of state.jobs) {
        if (!jobData || typeof jobData.name !== "string" || !jobData.name || typeof jobData.cron !== "string" || !jobData.cron) {
          this.logger.warn("Skipping invalid job data:", jobData);
          continue;
        }
        if (jobData.persist === false || this.removedDuringRestore.has(jobData.name) || this.crons.has(jobData.name)) continue;
        let cron: Cron | undefined;
        try {
          if (!["running", "stopped", "paused", "error"].includes(jobData.status)) throw new Error("Invalid job status");
          if (jobData.timezone !== undefined && typeof jobData.timezone !== "string") throw new Error("Invalid job timezone");
          cron = new Cron({
            name: jobData.name,
            cron: jobData.cron,
            timezone: jobData.timezone,
            callback: () => {
              this.logger.warn(`Restored job '${jobData.name}' executed but no callback was provided`);
            },
            logger: this.logger,
            maxHistory: this.config.maxHistoryEntries,
            priority: jobData.priority,
          }, this.config);
          if (this.enableMetrics) {
            if (jobData.history !== undefined && !Array.isArray(jobData.history)) throw new Error("Invalid job history");
            const history = jobData.history?.map(entry => ({ ...entry, timestamp: new Date(entry.timestamp) }));
            cron.hydratePersistence({ history, metrics: jobData.metrics });
          }
          if (jobData.status === "paused") {
            cron.start();
            cron.pause();
          } else if (jobData.status === "running" || this.autoStart) {
            cron.start();
          }
          // Commit only a fully validated job; corrupt records must not leave timers or entries behind.
          this.crons.set(cron.name, cron);
          this.jobPersistence.set(cron.name, true);
          this.restoredJobs.add(cron.name);
          restoredCount++;
        } catch (error) {
          cron?.destroy();
          this.logger.warn(`Failed to restore job '${jobData.name}':`, error);
        }
      }
      if (restoredCount > 0) this.logger.info(`Restored ${restoredCount} cron jobs from persistence`);
    } catch (error) {
      throw new Error(`Failed to restore state: ${error}`);
    }
  }

  async ready(): Promise<void> {
    await this.initialRestorePromise;
  }

  /**
   * Creates a new instance of `Baker`.
   */
  public static create(options: IBakerOptions = {}) {
    return new Baker(options);
  }
}

export default Baker;

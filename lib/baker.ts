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
  private initialRestorePromise: Promise<void> = Promise.resolve();
  private config: SchedulerConfig;
  private persistence: PersistenceOptions;
  private persistenceProvider?: PersistenceProvider;
  private enableMetrics: boolean;
  private onError?: (error: Error, jobName: string) => void;

  constructor(options: IBakerOptions = {}) {
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
        console.warn("Failed to restore state:", err);
      });
      this.initialRestorePromise = restorePromise;
    }

    if (options.autoStart) {
      this.initialRestorePromise.finally(() => this.bakeAll());
    }
  }

  add<T extends string = string>(options: CronOptions<T>): ICron<T> {
    const existingCron = this.crons.get(options.name);
    if (existingCron) {
      if (this.restoredJobs.has(options.name)) {
        existingCron.destroy();
        this.crons.delete(options.name);
        this.restoredJobs.delete(options.name);
        this.jobPersistence.delete(options.name);
      } else {
        throw new Error(`Cron job with name '${options.name}' already exists`);
      }
    }
    this.jobPersistence.delete(options.name);

    const cronConfig = {
      useCalculatedTimeouts: this.config.useCalculatedTimeouts,
      pollingInterval: this.config.pollingInterval,
    };

    const enhancedOptions: CronOptions<T> = {
      ...options,
      maxHistory: options.maxHistory ?? this.config.maxHistoryEntries,
      onError:
        options.onError ??
        ((error: Error) => {
          if (this.onError) {
            this.onError(error, options.name);
          }
        }),
    };

    const cron = Cron.create(enhancedOptions, cronConfig);
    const shouldPersist = options.persist ?? true;
    this.jobPersistence.set(cron.name, shouldPersist);
    this.crons.set(cron.name, cron);

    if (this.persistence.enabled && !this.isRestoring) {
      this.saveState().catch((err) => {
        console.warn("Failed to save state:", err);
      });
    }

    return cron;
  }

  remove(name: string): void {
    const cron = this.crons.get(name);
    if (cron) {
      cron.destroy();
      this.crons.delete(name);
      this.restoredJobs.delete(name);
      this.jobPersistence.delete(name);

      if (this.persistence.enabled) {
        this.saveState().catch((err) => {
          console.warn("Failed to save state:", err);
        });
      }
    }
  }

  bake(name: string): void {
    const cron = this.crons.get(name);
    if (cron) {
      cron.start();
    }
  }

  stop(name: string): void {
    const cron = this.crons.get(name);
    if (cron) {
      cron.stop();
    }
  }

  pause(name: string): void {
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
    const cron = this.crons.get(name);
    if (cron) {
      cron.destroy();
      this.crons.delete(name);
      this.restoredJobs.delete(name);
      this.jobPersistence.delete(name);

      if (this.persistence.enabled) {
        this.saveState().catch((err) => {
          console.warn("Failed to save state:", err);
        });
      }
    }
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
    this.crons.forEach((cron) => cron.start());
  }

  stopAll(): void {
    this.crons.forEach((cron) => cron.stop());
  }

  pauseAll(): void {
    this.crons.forEach((cron) => cron.pause());
  }

  resumeAll(): void {
    this.crons.forEach((cron) => cron.resume());
  }

  destroyAll(): void {
    this.crons.forEach((cron) => cron.destroy());
    this.crons.clear();
    this.restoredJobs.clear();
    this.jobPersistence.clear();

    if (this.persistence.enabled) {
      this.saveState().catch((err) => {
        console.warn("Failed to save state:", err);
      });
    }
  }

  resetAllMetrics(): void {
    if (this.enableMetrics) {
      this.crons.forEach((cron) => cron.resetMetrics());
    }
  }

  async saveState(): Promise<void> {
    if (!this.persistence.enabled || !this.persistenceProvider) return;
    try {
      const jobs = Array.from(this.crons.entries())
        .filter(([name]) => this.jobPersistence.get(name) !== false)
        .map(([name, cron]) => ({
          name,
          cron: String(cron.cron),
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
      await this.persistenceProvider.save(state);
    } catch (error) {
      throw new Error(`Failed to save state: ${error}`);
    }
  }

  async restoreState(): Promise<void> {
    if (!this.persistence.enabled || !this.persistenceProvider) return;
    if (this.isRestoring) return;
    this.isRestoring = true;
    try {
      const state = await this.persistenceProvider.load();
      if (!state) return;
      if (!state.jobs || !Array.isArray(state.jobs)) {
        throw new Error("Invalid state format");
      }
      let restoredCount = 0;
      for (const jobData of state.jobs) {
        if (!jobData.name || !jobData.cron) {
          console.warn("Skipping invalid job data:", jobData);
          continue;
        }
        if (jobData.persist === false) {
          continue;
        }
        if (this.crons.has(jobData.name)) {
          // User code already defined this job; treat their configuration as canonical.
          continue;
        }
        try {
          const options: CronOptions = {
            name: jobData.name,
            cron: jobData.cron,
            callback: () => {
              console.warn(
                `Restored job '${jobData.name}' executed but no callback was provided`
              );
            },
            priority: jobData.priority,
            start: jobData.status === "running",
            persist: true,
          };
          this.add(options);
          const cron = this.crons.get(jobData.name);
          if (
            cron &&
            typeof cron.hydratePersistence === "function" &&
            this.enableMetrics
          ) {
            const history = jobData.history?.map((entry) => ({
              ...entry,
              timestamp: new Date(entry.timestamp),
            }));
            cron.hydratePersistence({
              history,
              metrics: jobData.metrics,
            });
          }
          this.restoredJobs.add(jobData.name);
          restoredCount++;
        } catch (error) {
          console.warn(`Failed to restore job '${jobData.name}':`, error);
        }
      }
      if (restoredCount > 0) {
        console.log(`Restored ${restoredCount} cron jobs from persistence`);
      }
    } catch (error) {
      throw new Error(`Failed to restore state: ${error}`);
    } finally {
      this.isRestoring = false;
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

import Cron from '@/lib/cron';
import { 
  CronOptions, 
  IBaker, 
  IBakerOptions, 
  ICron, 
  Status, 
  ExecutionHistory, 
  JobMetrics,
  SchedulerConfig,
  PersistenceOptions 
} from '@/lib/types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * A class that implements the `IBaker` interface and provides methods to manage cron jobs.
 */
class Baker implements IBaker {
  private crons: Map<string, ICron> = new Map();
  private config: SchedulerConfig;
  private persistence: PersistenceOptions;
  private enableMetrics: boolean;
  private onError?: (error: Error, jobName: string) => void;

  constructor(options: IBakerOptions = {}) {
    this.config = {
      pollingInterval: options.schedulerConfig?.pollingInterval ?? 1000,
      useCalculatedTimeouts: options.schedulerConfig?.useCalculatedTimeouts ?? true,
      maxHistoryEntries: options.schedulerConfig?.maxHistoryEntries ?? 100,
    };
    
    this.persistence = {
      enabled: options.persistence?.enabled ?? false,
      filePath: options.persistence?.filePath ?? './cronbake-state.json',
      autoRestore: options.persistence?.autoRestore ?? true,
    };
    
    this.enableMetrics = options.enableMetrics ?? true;
    this.onError = options.onError;

    if (this.persistence.enabled && this.persistence.autoRestore) {
      this.restoreState().catch(err => {
        console.warn('Failed to restore state:', err);
      });
    }

    if (options.autoStart) {
      this.bakeAll();
    }
  }

  add<T extends string = string>(options: CronOptions<T>): ICron<T> {
    if (this.crons.has(options.name)) {
      throw new Error(`Cron job with name '${options.name}' already exists`);
    }

    const cronConfig = {
      useCalculatedTimeouts: this.config.useCalculatedTimeouts,
      pollingInterval: this.config.pollingInterval,
    };

    const enhancedOptions: CronOptions<T> = {
      ...options,
      maxHistory: options.maxHistory ?? this.config.maxHistoryEntries,
      onError: options.onError ?? ((error: Error) => {
        if (this.onError) {
          this.onError(error, options.name);
        }
      }),
    };

    const cron = Cron.create(enhancedOptions, cronConfig);
    this.crons.set(cron.name, cron);

    if (this.persistence.enabled) {
      this.saveState().catch(err => {
        console.warn('Failed to save state:', err);
      });
    }

    return cron;
  }

  remove(name: string): void {
    const cron = this.crons.get(name);
    if (cron) {
      cron.destroy();
      this.crons.delete(name);

      if (this.persistence.enabled) {
        this.saveState().catch(err => {
          console.warn('Failed to save state:', err);
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

      if (this.persistence.enabled) {
        this.saveState().catch(err => {
          console.warn('Failed to save state:', err);
        });
      }
    }
  }

  getStatus(name: string): Status {
    const cron = this.crons.get(name);
    return cron ? cron.getStatus() : 'stopped';
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
    return cron && this.enableMetrics ? cron.getMetrics() : {
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

    if (this.persistence.enabled) {
      this.saveState().catch(err => {
        console.warn('Failed to save state:', err);
      });
    }
  }

  resetAllMetrics(): void {
    if (this.enableMetrics) {
      this.crons.forEach((cron) => cron.resetMetrics());
    }
  }

  async saveState(): Promise<void> {
    if (!this.persistence.enabled) return;

    try {
      const state = {
        timestamp: new Date().toISOString(),
        jobs: Array.from(this.crons.entries()).map(([name, cron]) => ({
          name,
          cron: cron.cron,
          status: cron.getStatus(),
          priority: cron.priority,
          metrics: this.enableMetrics ? cron.getMetrics() : undefined,
          history: this.enableMetrics ? cron.getHistory() : undefined,
        })),
        config: this.config,
      };

      const filePath = path.resolve(this.persistence.filePath!);
      const dir = path.dirname(filePath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await fs.promises.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
      throw new Error(`Failed to save state: ${error}`);
    }
  }

  async restoreState(): Promise<void> {
    if (!this.persistence.enabled) return;

    try {
      const filePath = path.resolve(this.persistence.filePath!);
      
      if (!fs.existsSync(filePath)) {
        return;
      }

      const data = await fs.promises.readFile(filePath, 'utf8');
      const state = JSON.parse(data);

      if (!state.jobs || !Array.isArray(state.jobs)) {
        throw new Error('Invalid state file format');
      }

      for (const jobData of state.jobs) {
        if (!jobData.name || !jobData.cron) {
          console.warn('Skipping invalid job data:', jobData);
          continue;
        }

        try {
          const options: CronOptions = {
            name: jobData.name,
            cron: jobData.cron,
            callback: () => {
              console.warn(`Restored job '${jobData.name}' executed but no callback was provided`);
            },
            priority: jobData.priority,
            start: jobData.status === 'running',
          };

          this.add(options);
        } catch (error) {
          console.warn(`Failed to restore job '${jobData.name}':`, error);
        }
      }

      console.log(`Restored ${state.jobs.length} cron jobs from persistence`);
    } catch (error) {
      throw new Error(`Failed to restore state: ${error}`);
    }
  }

  /**
   * Creates a new instance of `Baker`.
   */
  public static create(options: IBakerOptions = {}) {
    return new Baker(options);
  }
}

export default Baker;
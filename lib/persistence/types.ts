import { ExecutionHistory, JobMetrics, SchedulerConfig, Status } from "../types";

type PersistedJob = {
  name: string;
  cron: string;
  status: Status;
  priority: number;
  metrics?: JobMetrics;
  history?: ExecutionHistory[];
};

type PersistedState = {
  version: number;
  timestamp: string;
  config: SchedulerConfig;
  jobs: PersistedJob[];
};

interface PersistenceProvider {
  save(state: PersistedState): Promise<void>;
  load(): Promise<PersistedState | null>;
}

/** Minimal redis-like client */
interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

export type { PersistedState, PersistedJob, PersistenceProvider, RedisLikeClient };


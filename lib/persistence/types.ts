import { JobMetrics, SchedulerConfig, Status } from "../types";

type PersistedExecutionHistory = {
  timestamp: string;
  duration: number;
  success: boolean;
  error?: string;
};

type PersistedJob = {
  name: string;
  cron: string;
  status: Status;
  priority: number;
  metrics?: JobMetrics;
  history?: PersistedExecutionHistory[];
  persist?: boolean;
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

export type {
  PersistedState,
  PersistedJob,
  PersistedExecutionHistory,
  PersistenceProvider,
  RedisLikeClient,
};


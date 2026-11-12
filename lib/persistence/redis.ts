import { PersistedState, PersistenceProvider, RedisLikeClient } from "./types";

type RedisProviderOptions = {
  client: RedisLikeClient;
  key?: string;
};

class RedisPersistenceProvider implements PersistenceProvider {
  private key: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(private options: RedisProviderOptions) {
    if (!options?.client || typeof options.client.get !== "function" || typeof options.client.set !== "function") {
      throw new Error("RedisPersistenceProvider requires a redis-like client with get/set");
    }
    this.key = options.key ?? "cronbake:state";
  }

  async save(state: PersistedState): Promise<void> {
    const data = JSON.stringify(state);
    const write = async () => { await this.options.client.set(this.key, data); };
    this.queue = this.queue.then(write, write);
    return this.queue;
  }

  async load(): Promise<PersistedState | null> {
    const raw = await this.options.client.get(this.key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid persisted state");
    }
    return parsed as PersistedState;
  }
}

export { RedisPersistenceProvider };
export type { RedisProviderOptions };


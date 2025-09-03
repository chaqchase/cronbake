import { PersistedState, PersistenceProvider, RedisLikeClient } from "./types";

type RedisProviderOptions = {
  client: RedisLikeClient;
  key?: string;
};

class RedisPersistenceProvider implements PersistenceProvider {
  private key: string;
  constructor(private options: RedisProviderOptions) {
    if (!options?.client) {
      throw new Error("RedisPersistenceProvider requires a redis-like client with get/set");
    }
    this.key = options.key ?? "cronbake:state";
  }

  async save(state: PersistedState): Promise<void> {
    await this.options.client.set(this.key, JSON.stringify(state));
  }

  async load(): Promise<PersistedState | null> {
    const raw = await this.options.client.get(this.key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PersistedState;
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }
}

export { RedisPersistenceProvider };
export type { RedisProviderOptions };


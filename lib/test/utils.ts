import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FilePersistenceProvider } from '@/lib/persistence/file';
import { RedisPersistenceProvider } from '@/lib/persistence/redis';
import type { RedisLikeClient } from '@/lib/persistence/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tmpFile = (prefix = 'cronbake-test-'): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return path.join(dir, 'state.json');
};

const cleanupFile = (filePath: string) => {
  try { fs.unlinkSync(filePath); } catch {}
  try { fs.rmdirSync(path.dirname(filePath)); } catch {}
};

class FakeRedis implements RedisLikeClient {
  private store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

const createFileProvider = (filePath?: string) => {
  const fp = filePath ?? tmpFile();
  return { provider: new FilePersistenceProvider(fp), filePath: fp };
};

const createRedisProvider = (key = 'test:cronbake') => {
  const client = new FakeRedis();
  const provider = new RedisPersistenceProvider({ client, key });
  return { provider, client };
};

export { sleep, tmpFile, cleanupFile, FakeRedis, createFileProvider, createRedisProvider };


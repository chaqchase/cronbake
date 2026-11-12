import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilePersistenceProvider, RedisPersistenceProvider } from "./index";
import type { PersistedState } from "./persistence/types";

const snapshot = (name: string): PersistedState => ({ version: 1, timestamp: new Date().toISOString(), config: {},
  jobs: [{ name, cron: "@daily", status: "stopped", priority: 0 }] });

test("independent file providers never collide on temporary files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cronbake-concurrent-"));
  const path = join(dir, "state.json");
  try {
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) =>
      new FilePersistenceProvider(path).save(snapshot(`job-${i}`))));
    expect(results.every(result => result.status === "fulfilled")).toBe(true);
    expect(JSON.parse(await readFile(path, "utf8")).jobs).toHaveLength(1);
    expect(await readdir(dir)).toEqual(["state.json"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("file saves capture the snapshot at invocation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cronbake-snapshot-"));
  try {
    const provider = new FilePersistenceProvider(join(dir, "state.json"));
    const value = snapshot("original");
    const saving = provider.save(value);
    value.jobs[0].name = "mutated";
    await saving;
    expect((await provider.load())?.jobs[0].name).toBe("original");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("file storage distinguishes a missing file from corrupted data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cronbake-corrupt-"));
  try {
    const path = join(dir, "state.json");
    const provider = new FilePersistenceProvider(path);
    expect(await provider.load()).toBeNull();
    await writeFile(path, "{corrupt");
    await expect(provider.load()).rejects.toThrow();
    await writeFile(path, "null");
    await expect(provider.load()).rejects.toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Redis writes stay ordered and recover after a failed write", async () => {
  let value: string | null = null;
  let calls = 0;
  const provider = new RedisPersistenceProvider({ client: {
    get: async () => value,
    set: async (_key, next) => {
      const call = calls++;
      if (call === 0) { await new Promise(resolve => setTimeout(resolve, 20)); throw new Error("unavailable"); }
      if (call === 1) await new Promise(resolve => setTimeout(resolve, 20));
      value = next;
    },
  } });
  const results = await Promise.allSettled([provider.save(snapshot("failed")), provider.save(snapshot("second")), provider.save(snapshot("last"))]);
  expect(results.map(result => result.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
  expect((await provider.load())?.jobs[0].name).toBe("last");
});

test("Redis storage reports corrupt data", async () => {
  const provider = new RedisPersistenceProvider({ client: { get: async () => "{corrupt", set: async () => {} } });
  await expect(provider.load()).rejects.toThrow();
});

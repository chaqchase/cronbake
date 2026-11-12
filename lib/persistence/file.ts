import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { PersistedState, PersistenceProvider } from "./types";

class FilePersistenceProvider implements PersistenceProvider {
  private queue: Promise<void> = Promise.resolve();

  constructor(private filePath: string) {}

  async save(state: PersistedState): Promise<void> {
    const filePath = path.resolve(this.filePath);
    // Capture now: callers may reuse or mutate their snapshot while a write waits.
    const data = JSON.stringify(state, null, 2);
    const write = async () => {
      const tmp = `${filePath}.${randomUUID()}.tmp`;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      try {
        await fs.writeFile(tmp, data, { encoding: "utf8", flag: "wx", mode: 0o600 });
        await fs.rename(tmp, filePath);
      } finally {
        await fs.rm(tmp, { force: true });
      }
    };
    this.queue = this.queue.then(write, write);
    return this.queue;
  }

  async load(): Promise<PersistedState | null> {
    let data: string;
    try {
      data = await fs.readFile(path.resolve(this.filePath), "utf8");
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return null;
      throw error;
    }
    const state = JSON.parse(data);
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      throw new Error("Invalid persisted state");
    }
    return state as PersistedState;
  }
}

export { FilePersistenceProvider };

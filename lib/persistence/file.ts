import * as fs from "fs";
import * as path from "path";
import { PersistedState, PersistenceProvider } from "./types";

class FilePersistenceProvider implements PersistenceProvider {
  private queue: Promise<void> = Promise.resolve();

  constructor(private filePath: string) {}

  async save(state: PersistedState): Promise<void> {
    const filePath = path.resolve(this.filePath);
    const dir = path.dirname(filePath);
    const tmp = `${filePath}.tmp`;

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const write = async () => {
      const data = JSON.stringify(state, null, 2);
      // Atomic write: write to temp, then rename over destination
      await fs.promises.writeFile(tmp, data, "utf8");
      await fs.promises.rename(tmp, filePath);
    };

    // Serialize writes to avoid interleaving
    this.queue = this.queue.then(write, write);
    return this.queue;
  }

  async load(): Promise<PersistedState | null> {
    const filePath = path.resolve(this.filePath);
    if (!fs.existsSync(filePath)) return null;
    try {
      const data = await fs.promises.readFile(filePath, "utf8");
      const state = JSON.parse(data);
      if (!state || typeof state !== "object") return null;
      return state as PersistedState;
    } catch {
      // If file is mid-write or corrupted, return null so caller can retry later
      return null;
    }
  }
}

export { FilePersistenceProvider };

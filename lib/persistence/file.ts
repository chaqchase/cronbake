import * as fs from "fs";
import * as path from "path";
import { PersistedState, PersistenceProvider } from "./types";

class FilePersistenceProvider implements PersistenceProvider {
  constructor(private filePath: string) {}

  async save(state: PersistedState): Promise<void> {
    const filePath = path.resolve(this.filePath);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
  }

  async load(): Promise<PersistedState | null> {
    const filePath = path.resolve(this.filePath);
    if (!fs.existsSync(filePath)) return null;
    const data = await fs.promises.readFile(filePath, "utf8");
    const state = JSON.parse(data);
    if (!state || typeof state !== "object") return null;
    return state as PersistedState;
  }
}

export { FilePersistenceProvider };


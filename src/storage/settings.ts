import path from "node:path";
import { JsonFile } from "./jsonFile.js";

export interface Settings {
  autoAccept: boolean;
}

export function settingsFile(dataDir: string): JsonFile<Settings> {
  return new JsonFile<Settings>(path.join(dataDir, "settings.json"), () => ({ autoAccept: false }));
}

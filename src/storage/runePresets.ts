import { randomUUID } from "node:crypto";
import path from "node:path";
import type { RunePage } from "../services/runes.js";
import { JsonFile } from "./jsonFile.js";

export interface RunePreset extends RunePage {
  id: string;
}

/** Favourite rune pages, keyed by champion id. */
export type RunePresetMap = Record<string, RunePreset[]>;

export class RunePresetStore {
  private readonly file: JsonFile<RunePresetMap>;

  constructor(dataDir: string) {
    this.file = new JsonFile(path.join(dataDir, "rune-presets.json"), () => ({}));
  }

  all(): Promise<RunePresetMap> {
    return this.file.read();
  }

  async add(championId: number, page: RunePage): Promise<RunePreset> {
    const presets = await this.file.read();
    const preset = { id: randomUUID(), ...page };
    const key = String(championId);
    await this.file.write({ ...presets, [key]: [...(presets[key] ?? []), preset] });
    return preset;
  }

  /** Replaces a preset; returns false if it does not exist. */
  async update(championId: number, id: string, page: RunePage): Promise<boolean> {
    const presets = await this.file.read();
    const list = presets[String(championId)] ?? [];
    if (!list.some((p) => p.id === id)) return false;

    const updated = list.map((p) => (p.id === id ? { id, ...page } : p));
    await this.file.write({ ...presets, [String(championId)]: updated });
    return true;
  }

  async remove(championId: number, id: string): Promise<boolean> {
    const presets = await this.file.read();
    const key = String(championId);
    const list = presets[key] ?? [];
    const remaining = list.filter((p) => p.id !== id);
    if (remaining.length === list.length) return false;

    const next = { ...presets, [key]: remaining };
    if (remaining.length === 0) delete next[key];
    await this.file.write(next);
    return true;
  }

  /** Moves a preset first so it becomes the champion's default suggestion. */
  async makeDefault(championId: number, id: string): Promise<boolean> {
    const presets = await this.file.read();
    const key = String(championId);
    const list = presets[key] ?? [];
    const preset = list.find((p) => p.id === id);
    if (!preset) return false;

    await this.file.write({ ...presets, [key]: [preset, ...list.filter((p) => p !== preset)] });
    return true;
  }
}

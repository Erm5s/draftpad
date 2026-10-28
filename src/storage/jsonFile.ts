import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** Small JSON document persisted on disk with atomic writes. */
export class JsonFile<T> {
  private cache: T | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly defaults: () => T,
  ) {}

  async read(): Promise<T> {
    if (this.cache !== null) return this.cache;
    try {
      this.cache = JSON.parse(await readFile(this.file, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`[storage] could not read ${this.file}, using defaults: ${(error as Error).message}`);
      }
      this.cache = this.defaults();
    }
    return this.cache;
  }

  async write(value: T): Promise<void> {
    this.cache = value;
    // Serialize writes so a slow write never overwrites a newer one.
    this.writing = this.writing.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(value, null, 2));
      await rename(tmp, this.file);
    });
    return this.writing;
  }
}

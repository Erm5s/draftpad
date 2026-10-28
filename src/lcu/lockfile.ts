import { readFile } from "node:fs/promises";

export interface LcuCredentials {
  pid: number;
  port: number;
  password: string;
  protocol: string;
}

/** Parses `name:pid:port:password:protocol`. */
export function parseLockfile(content: string): LcuCredentials {
  const parts = content.trim().split(":");
  if (parts.length < 5) {
    throw new Error("Malformed lockfile");
  }

  const pid = Number(parts[1]);
  const port = Number(parts[2]);
  const password = parts.slice(3, -1).join(":");
  const protocol = parts[parts.length - 1]!;

  if (!Number.isInteger(port) || port <= 0 || !password) {
    throw new Error("Malformed lockfile");
  }
  return { pid, port, password, protocol };
}

/** Returns null while the client is not running (no lockfile). */
export async function readLockfile(path: string): Promise<LcuCredentials | null> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // EBUSY/EPERM can happen on Windows while the client is writing the file.
    if (code === "ENOENT" || code === "EBUSY" || code === "EPERM") return null;
    throw error;
  }
  return parseLockfile(content);
}

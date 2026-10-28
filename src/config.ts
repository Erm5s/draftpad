import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface Config {
  /** Path to the League client `lockfile` (or to the install directory containing it). */
  lockfilePath: string;
  /** Interface the web server binds to. Requests from non-private addresses are always rejected. */
  host: string;
  port: number;
  /** Fixed PIN for the phone. A random one is generated at startup when null. */
  pin: string | null;
  /** Directory where settings and favourite rune pages are stored. */
  dataDir: string;
}

const DEFAULTS: Config = {
  lockfilePath: "C:\\Riot Games\\League of Legends\\lockfile",
  host: "0.0.0.0",
  port: 3000,
  pin: null,
  dataDir: "data",
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const configFile = path.resolve(env.DRAFTPAD_CONFIG ?? "config.json");
  const fromFile = existsSync(configFile) ? readConfigFile(configFile) : {};

  const config: Config = { ...DEFAULTS, ...fromFile };
  if (env.DRAFTPAD_LOCKFILE) config.lockfilePath = env.DRAFTPAD_LOCKFILE;
  if (env.DRAFTPAD_HOST) config.host = env.DRAFTPAD_HOST;
  if (env.DRAFTPAD_PORT) config.port = Number(env.DRAFTPAD_PORT);
  if (env.DRAFTPAD_PIN) config.pin = env.DRAFTPAD_PIN;
  if (env.DRAFTPAD_DATA_DIR) config.dataDir = env.DRAFTPAD_DATA_DIR;

  return normalize(config);
}

function readConfigFile(file: string): Partial<Config> {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Partial<Config>;
  } catch (error) {
    throw new Error(`Invalid config file ${file}: ${(error as Error).message}`);
  }
}

function normalize(config: Config): Config {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid port: ${config.port}`);
  }
  if (config.pin !== null && !/^\d{4,12}$/.test(String(config.pin))) {
    throw new Error("PIN must contain 4 to 12 digits");
  }

  // Accept the install directory as well as the lockfile itself.
  let lockfilePath = config.lockfilePath;
  if (!/lockfile$/i.test(lockfilePath)) {
    lockfilePath = path.join(lockfilePath, "lockfile");
  }

  return {
    ...config,
    lockfilePath,
    pin: config.pin === null ? null : String(config.pin),
    dataDir: path.resolve(config.dataDir),
  };
}

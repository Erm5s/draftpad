import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type ErrorRequestHandler, type RequestHandler, type Router } from "express";
import { LcuError } from "../lcu/client.js";
import { NotConnectedError } from "../lcu/connector.js";
import type { StateStore } from "../state.js";
import type { PinAuth } from "./auth.js";
import { HttpError } from "./errors.js";
import { isPrivateAddress, normalizeIp } from "./network.js";

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");
export const PIN_HEADER = "x-draftpad-pin";

interface AppOptions {
  auth: PinAuth;
  store: StateStore;
  routers: Router[];
}

export function createApp({ auth, store, routers }: AppOptions): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(lanOnly);
  app.use(express.static(PUBLIC_DIR));
  app.use("/api", express.json(), noStore);

  app.post("/api/auth", (req, res) => {
    const result = auth.check((req.body as { pin?: unknown } | undefined)?.pin, clientIp(req));
    if (result === "ok") res.status(204).end();
    else res.status(result === "locked" ? 429 : 401).json({ error: authMessage(result) });
  });

  app.use("/api", requirePin(auth));
  app.get("/api/state", (_req, res) => {
    res.json(store.get());
  });
  for (const router of routers) app.use("/api", router);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}

function clientIp(req: express.Request): string {
  return normalizeIp(req.socket.remoteAddress ?? "");
}

/** Never serve anything outside the local network, even if a port gets forwarded. */
const lanOnly: RequestHandler = (req, res, next) => {
  if (isPrivateAddress(clientIp(req))) return next();
  res.status(403).end();
};

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

function requirePin(auth: PinAuth): RequestHandler {
  return (req, res, next) => {
    const result = auth.check(req.get(PIN_HEADER), clientIp(req));
    if (result === "ok") return next();
    res.status(result === "locked" ? 429 : 401).json({ error: authMessage(result) });
  };
}

function authMessage(result: "invalid" | "locked"): string {
  return result === "locked" ? "Too many attempts, try again in a minute" : "Invalid PIN";
}

const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
  } else if (error instanceof NotConnectedError) {
    res.status(503).json({ error: error.message });
  } else if (error instanceof LcuError) {
    res.status(502).json({ error: error.message });
  } else if ((error as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON body" });
  } else {
    console.error(error);
    res.status(500).json({ error: "Internal error" });
  }
};

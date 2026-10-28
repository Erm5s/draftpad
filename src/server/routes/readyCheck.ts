import { Router } from "express";
import type { ReadyCheckService } from "../../services/readyCheck.js";
import { badRequest } from "../errors.js";

export function readyCheckRoutes(readyCheck: ReadyCheckService): Router {
  const router = Router();

  router.post("/ready-check/accept", async (_req, res) => {
    await readyCheck.accept();
    res.status(204).end();
  });

  router.post("/ready-check/decline", async (_req, res) => {
    await readyCheck.decline();
    res.status(204).end();
  });

  router.put("/settings/auto-accept", async (req, res) => {
    const enabled = (req.body as { enabled?: unknown } | undefined)?.enabled;
    if (typeof enabled !== "boolean") throw badRequest("`enabled` must be a boolean");
    await readyCheck.setAutoAccept(enabled);
    res.status(204).end();
  });

  return router;
}

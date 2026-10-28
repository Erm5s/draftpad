import { Router } from "express";
import type { ChampSelectService } from "../../services/champSelect.js";

export function champSelectRoutes(champSelect: ChampSelectService): Router {
  const router = Router();

  router.post("/champ-select/hover", async (req, res) => {
    await champSelect.hover(championIdFrom(req.body));
    res.status(204).end();
  });

  router.post("/champ-select/lock", async (req, res) => {
    await champSelect.lock(championIdFrom(req.body));
    res.status(204).end();
  });

  router.post("/champ-select/spells", async (req, res) => {
    const body = (req.body ?? {}) as { spell1Id?: unknown; spell2Id?: unknown };
    await champSelect.setSpells(Number(body.spell1Id), Number(body.spell2Id));
    res.status(204).end();
  });

  return router;
}

function championIdFrom(body: unknown): number {
  return Number((body as { championId?: unknown } | undefined)?.championId);
}

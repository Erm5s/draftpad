import { Router } from "express";
import { parseRunePage, type RuneService } from "../../services/runes.js";
import type { RunePresetStore } from "../../storage/runePresets.js";
import { badRequest, HttpError } from "../errors.js";

export function runeRoutes(runes: RuneService, presets: RunePresetStore): Router {
  const router = Router();

  router.post("/runes/apply", async (req, res) => {
    await runes.apply(parseRunePage(req.body));
    res.status(204).end();
  });

  router.get("/runes/current", async (_req, res) => {
    res.json(await runes.currentPage());
  });

  router.get("/runes/presets", async (_req, res) => {
    res.json(await presets.all());
  });

  router.post("/runes/presets/:championId", async (req, res) => {
    const preset = await presets.add(championId(req.params.championId), parseRunePage(req.body));
    res.status(201).json(preset);
  });

  router.put("/runes/presets/:championId/:id", async (req, res) => {
    const page = parseRunePage(req.body);
    found(await presets.update(championId(req.params.championId), req.params.id, page));
    res.status(204).end();
  });

  router.post("/runes/presets/:championId/:id/default", async (req, res) => {
    found(await presets.makeDefault(championId(req.params.championId), req.params.id));
    res.status(204).end();
  });

  router.delete("/runes/presets/:championId/:id", async (req, res) => {
    found(await presets.remove(championId(req.params.championId), req.params.id));
    res.status(204).end();
  });

  return router;
}

function championId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw badRequest("Invalid champion id");
  return id;
}

function found(ok: boolean): void {
  if (!ok) throw new HttpError(404, "Rune preset not found");
}

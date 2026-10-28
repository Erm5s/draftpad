import type { LcuConnector } from "../lcu/connector.js";
import { badRequest } from "../server/errors.js";

const PAGES_URI = "/lol-perks/v1/pages";
const INVENTORY_URI = "/lol-perks/v1/inventory";
const CURRENT_PAGE_URI = "/lol-perks/v1/currentpage";

/** Pages created by Draftpad carry this prefix so they can be replaced safely. */
const PAGE_PREFIX = "DP ";
const MAX_PAGE_NAME_LENGTH = 25;

export interface RunePage {
  name: string;
  primaryStyleId: number;
  subStyleId: number;
  /** 4 primary perks, 2 secondary perks, 3 stat shards. */
  selectedPerkIds: number[];
}

interface LcuRunePage extends RunePage {
  id: number;
  current: boolean;
  isDeletable: boolean;
  lastModified: number;
}

export class RuneService {
  constructor(private readonly lcu: LcuConnector) {}

  /** Creates the page in the client and makes it the current one, freeing a slot if needed. */
  async apply(page: RunePage): Promise<void> {
    const client = this.lcu.client;
    const [pages, inventory] = await Promise.all([
      client.get<LcuRunePage[]>(PAGES_URI),
      client.get<{ ownedPageCount: number }>(INVENTORY_URI),
    ]);

    const editable = pages.filter((p) => p.isDeletable);
    const previous = editable.filter((p) => p.name.startsWith(PAGE_PREFIX));
    for (const p of previous) {
      await client.delete(`${PAGES_URI}/${p.id}`);
    }

    // Still at the limit: replace the current page, or the oldest one.
    const remaining = editable.filter((p) => !previous.includes(p));
    if (remaining.length >= inventory.ownedPageCount && remaining.length > 0) {
      const victim =
        remaining.find((p) => p.current) ??
        [...remaining].sort((a, b) => a.lastModified - b.lastModified)[0]!;
      await client.delete(`${PAGES_URI}/${victim.id}`);
    }

    await client.post(PAGES_URI, {
      name: (PAGE_PREFIX + page.name).slice(0, MAX_PAGE_NAME_LENGTH),
      primaryStyleId: page.primaryStyleId,
      subStyleId: page.subStyleId,
      selectedPerkIds: page.selectedPerkIds,
      current: true,
    });
  }

  async currentPage(): Promise<RunePage> {
    const page = await this.lcu.client.get<LcuRunePage>(CURRENT_PAGE_URI);
    return {
      name: page.name.startsWith(PAGE_PREFIX) ? page.name.slice(PAGE_PREFIX.length) : page.name,
      primaryStyleId: page.primaryStyleId,
      subStyleId: page.subStyleId,
      selectedPerkIds: page.selectedPerkIds,
    };
  }
}

export function parseRunePage(body: unknown): RunePage {
  const input = (body ?? {}) as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const primaryStyleId = Number(input.primaryStyleId);
  const subStyleId = Number(input.subStyleId);
  const perks = input.selectedPerkIds;

  if (!name || name.length > 40) throw badRequest("`name` must contain 1 to 40 characters");
  if (!isId(primaryStyleId) || !isId(subStyleId) || primaryStyleId === subStyleId) {
    throw badRequest("Primary and secondary styles must be two different trees");
  }
  if (!Array.isArray(perks) || perks.length !== 9 || !perks.every((id) => isId(id))) {
    throw badRequest("`selectedPerkIds` must contain 9 rune ids");
  }
  return { name, primaryStyleId, subStyleId, selectedPerkIds: perks as number[] };
}

function isId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

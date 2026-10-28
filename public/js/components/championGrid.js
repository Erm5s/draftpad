import { h, normalizeSearch } from "../ui.js";

/** Grid of every champion; tiles are built once and filtered in place. */
export function createChampionGrid(data, { onSelect }) {
  const tiles = new Map();
  const root = h("div", { class: "champ-grid" });

  for (const champion of data.champions) {
    const tile = h(
      "button",
      { type: "button", class: "champ-tile", onclick: () => onSelect(champion.id) },
      h("img", { src: champion.image, alt: "", loading: "lazy", width: 64, height: 64 }),
      h("span", {}, champion.name),
    );
    tiles.set(champion.id, { tile, keys: [normalizeSearch(champion.name), normalizeSearch(champion.alias)] });
    root.append(tile);
  }

  return {
    root,
    /** Shows champions accepted by `predicate` and matching `query`; returns the visible count. */
    filter(query, predicate = () => true) {
      const needle = normalizeSearch(query);
      let visible = 0;
      for (const [id, { tile, keys }] of tiles) {
        const show = predicate(id) && (!needle || keys.some((key) => key.includes(needle)));
        tile.hidden = !show;
        if (show) visible++;
      }
      return visible;
    },
    setSelected(championId) {
      for (const [id, { tile }] of tiles) tile.classList.toggle("selected", id === championId);
    },
  };
}

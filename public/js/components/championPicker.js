import { h } from "../ui.js";
import { createChampionGrid } from "./championGrid.js";
import { openSheet } from "./sheet.js";

export function openChampionPicker(data, onPick) {
  const grid = createChampionGrid(data, {
    onSelect: (id) => {
      close();
      onPick(id);
    },
  });
  const search = h("input", {
    type: "search",
    class: "search",
    placeholder: "Search a champion",
    autocomplete: "off",
    oninput: () => grid.filter(search.value),
  });

  const close = openSheet({
    title: "Choose a champion",
    body: h("div", { class: "picker" }, search, grid.root),
  });
}

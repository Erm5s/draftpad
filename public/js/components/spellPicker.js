import { h } from "../ui.js";
import { openSheet } from "./sheet.js";

/** Lets the player choose a summoner spell available in the current game mode. */
export function openSpellPicker(data, { gameMode, currentId, onPick }) {
  const mode = gameMode || "CLASSIC";
  const spells = data.spells.filter((spell) => spell.modes.includes(mode));

  const close = openSheet({
    title: "Summoner spell",
    body: h(
      "div",
      { class: "spell-grid" },
      spells.map((spell) =>
        h(
          "button",
          {
            type: "button",
            class: `spell-tile${spell.id === currentId ? " selected" : ""}`,
            onclick: () => {
              close();
              onPick(spell.id);
            },
          },
          h("img", { src: spell.image, alt: "" }),
          h("span", {}, spell.name),
        ),
      ),
    ),
  });
}

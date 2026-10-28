import { h, toast } from "../ui.js";
import { openSheet } from "./sheet.js";

/**
 * Editor for a rune page.
 * `initial` is an optional { name, primaryStyleId, subStyleId, selectedPerkIds }.
 * `onSave(page)` must return a promise; the sheet closes once it resolves.
 */
export function openRuneEditor({ data, title, initial, defaultName, onSave }) {
  const page = fromPage(data, initial);

  const nameInput = h("input", {
    class: "search",
    maxlength: 40,
    placeholder: "Page name",
    value: initial?.name ?? defaultName ?? "",
  });
  const content = h("div", { class: "rune-editor" });
  const saveButton = h("button", { class: "btn btn-primary big", type: "button", onclick: save });

  function render() {
    const primary = data.stylesById.get(page.primaryStyleId);
    const secondary = data.stylesById.get(page.subStyleId);

    content.replaceChildren(
      h("label", { class: "field-label" }, "Name"),
      nameInput,

      h("h3", { class: "rune-section" }, "Primary"),
      styleTabs(data.styles, page.primaryStyleId, (id) => {
        page.primaryStyleId = id;
        page.primary = [null, null, null, null];
        if (page.subStyleId === id) {
          page.subStyleId = null;
          page.secondary = [];
        }
        render();
      }),
      primary &&
        primary.slots.map((runes, row) =>
          runeRow(runes, (id) => page.primary[row] === id, (id) => {
            page.primary[row] = id;
            render();
          }, row === 0),
        ),

      h("h3", { class: "rune-section" }, "Secondary"),
      primary
        ? styleTabs(
            data.styles.filter((s) => s.id !== page.primaryStyleId),
            page.subStyleId,
            (id) => {
              page.subStyleId = id;
              page.secondary = [];
              render();
            },
          )
        : h("p", { class: "muted" }, "Choose a primary tree first."),
      secondary &&
        secondary.slots.slice(1).map((runes, index) =>
          runeRow(runes, (id) => page.secondary.some((s) => s.id === id), (id) => {
            selectSecondary(page, index + 1, id);
            render();
          }),
        ),

      h("h3", { class: "rune-section" }, "Shards"),
      data.shardRows.map((row, index) => shardRow(row, page.shards[index], (id) => {
        page.shards[index] = id;
        render();
      })),
    );

    const missing = missingParts(page);
    saveButton.disabled = missing.length > 0;
    saveButton.textContent = missing.length > 0 ? `Missing: ${missing.join(", ")}` : "Save page";
  }

  async function save() {
    const name = nameInput.value.trim();
    if (!name) {
      toast("Give this page a name", "error");
      nameInput.focus();
      return;
    }
    saveButton.disabled = true;
    try {
      await onSave(toPage(page, name));
      close();
    } catch (error) {
      toast(error.message, "error");
      saveButton.disabled = false;
    }
  }

  const close = openSheet({ title, body: content, footer: saveButton });
  render();
}

function fromPage(data, initial) {
  const perks = initial?.selectedPerkIds ?? [];
  const primaryStyle = data.stylesById.get(initial?.primaryStyleId);
  const subStyle = data.stylesById.get(initial?.subStyleId);

  const rowOf = (style, id) => style?.slots.findIndex((runes) => runes.some((r) => r.id === id)) ?? -1;

  const primary = [null, null, null, null];
  for (const id of perks.slice(0, 4)) {
    const row = rowOf(primaryStyle, id);
    if (row >= 0) primary[row] = id;
  }
  const secondary = perks
    .slice(4, 6)
    .map((id) => ({ id, row: rowOf(subStyle, id) }))
    .filter((s) => s.row > 0);
  const shards = [0, 1, 2].map((i) => perks[6 + i] ?? null);

  return {
    primaryStyleId: primaryStyle?.id ?? null,
    subStyleId: subStyle?.id ?? null,
    primary,
    secondary,
    shards,
  };
}

function toPage(page, name) {
  const secondary = [...page.secondary].sort((a, b) => a.row - b.row).map((s) => s.id);
  return {
    name,
    primaryStyleId: page.primaryStyleId,
    subStyleId: page.subStyleId,
    selectedPerkIds: [...page.primary, ...secondary, ...page.shards],
  };
}

/** Two secondary runes from two different rows; picking a third replaces the oldest. */
function selectSecondary(page, row, id) {
  const others = page.secondary.filter((s) => s.row !== row);
  page.secondary = [...others, { row, id }].slice(-2);
}

function missingParts(page) {
  const missing = [];
  if (!page.primaryStyleId || page.primary.some((id) => id === null)) missing.push("primary");
  if (!page.subStyleId || page.secondary.length < 2) missing.push("secondary");
  if (page.shards.some((id) => id === null)) missing.push("shards");
  return missing;
}

function styleTabs(styles, selectedId, onSelect) {
  return h(
    "div",
    { class: "style-tabs" },
    styles.map((style) =>
      h(
        "button",
        {
          type: "button",
          class: `style-tab${style.id === selectedId ? " selected" : ""}`,
          onclick: () => onSelect(style.id),
        },
        h("img", { src: style.icon, alt: "" }),
        h("span", {}, style.name),
      ),
    ),
  );
}

function runeRow(runes, isSelected, onSelect, keystone = false) {
  return h(
    "div",
    { class: `rune-row${keystone ? " keystones" : ""}` },
    runes.map((rune) =>
      h(
        "button",
        {
          type: "button",
          class: `rune${isSelected(rune.id) ? " selected" : ""}`,
          title: rune.description,
          onclick: () => onSelect(rune.id),
        },
        h("img", { src: rune.icon, alt: "" }),
        h("span", {}, rune.name),
      ),
    ),
  );
}

function shardRow(shards, selectedId, onSelect) {
  return h(
    "div",
    { class: "rune-row shards" },
    shards.map((shard) =>
      h(
        "button",
        {
          type: "button",
          class: `rune shard${shard.id === selectedId ? " selected" : ""}`,
          title: shard.name,
          onclick: () => onSelect(shard.id),
        },
        h("img", { src: shard.icon, alt: "", onerror: (e) => (e.target.hidden = true) }),
        h("span", {}, shard.short),
      ),
    ),
  );
}

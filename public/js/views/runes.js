import { api } from "../api.js";
import { openChampionPicker } from "../components/championPicker.js";
import { openRuneEditor } from "../components/runeEditor.js";
import { reloadPresets, update } from "../store.js";
import { h, toast, withBusy } from "../ui.js";

/** "Runes" tab: favourite pages per champion, applied in one tap. */
export class RunesView {
  constructor(root) {
    this.root = root;
    this.renderKey = null;
    this.lastSuggested = null;
  }

  update(app) {
    this.app = app;
    this.data = app.data;

    // Follow the champion the player is about to play, until they pick another one here.
    const suggested = suggestedChampion(app.state);
    if (suggested && suggested !== this.lastSuggested) {
      this.lastSuggested = suggested;
      if (app.runesChampionId !== suggested) {
        update({ runesChampionId: suggested });
        return;
      }
    }

    const connected = app.state?.connection === "connected";
    const key = `${app.runesChampionId}|${connected}|${JSON.stringify(app.presets)}`;
    if (key === this.renderKey) return;
    this.renderKey = key;
    this.render();
  }

  render() {
    const champion = this.data.championsById.get(this.app.runesChampionId);
    this.root.replaceChildren(champion ? this.championPage(champion) : this.overview());
  }

  overview() {
    const saved = Object.keys(this.app.presets)
      .map((id) => this.data.championsById.get(Number(id)))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    return h(
      "div",
      { class: "runes-view" },
      h("h1", {}, "Rune pages"),
      h("p", { class: "muted" }, "Save your favourite pages per champion and apply them in one tap during champion select."),
      h("button", { class: "btn btn-primary big", onclick: () => this.pickChampion() }, "Choose a champion"),
      saved.length > 0 && h("h2", { class: "section-title" }, "Your champions"),
      saved.length > 0 &&
        h(
          "div",
          { class: "saved-champions" },
          saved.map((champion) =>
            h(
              "button",
              { class: "saved-champion", onclick: () => update({ runesChampionId: champion.id }) },
              h("img", { src: champion.image, alt: "" }),
              h("span", {}, champion.name),
              h("small", {}, String(this.app.presets[champion.id].length)),
            ),
          ),
        ),
    );
  }

  championPage(champion) {
    const presets = this.app.presets[champion.id] ?? [];
    const connected = this.app.state?.connection === "connected";

    const importButton = h(
      "button",
      {
        class: "btn",
        disabled: !connected,
        onclick: () =>
          withBusy(importButton, async () => {
            const page = await api("GET", "/runes/current");
            this.edit(champion, null, page);
          }),
      },
      "Import from client",
    );

    return h(
      "div",
      { class: "runes-view" },
      h(
        "div",
        { class: "champion-header" },
        h("button", { class: "btn btn-ghost small back", onclick: () => update({ runesChampionId: null }), "aria-label": "Back" }, "‹"),
        h("img", { src: champion.image, alt: "" }),
        h("h1", {}, champion.name),
        h("button", { class: "btn small", onclick: () => this.pickChampion() }, "Change"),
      ),
      presets.length === 0
        ? h("p", { class: "muted empty" }, `No saved page for ${champion.name} yet.`)
        : h("div", { class: "preset-list" }, presets.map((preset, index) => this.presetCard(champion, preset, index === 0, connected))),
      h(
        "div",
        { class: "button-row" },
        h("button", { class: "btn btn-primary", onclick: () => this.edit(champion, null, null) }, "New page"),
        importButton,
      ),
      !connected && h("p", { class: "muted hint" }, "Start the League client to apply or import pages."),
    );
  }

  presetCard(champion, preset, isDefault, connected) {
    const keystone = this.data.perks.get(preset.selectedPerkIds[0]);
    const primary = this.data.stylesById.get(preset.primaryStyleId);
    const secondary = this.data.stylesById.get(preset.subStyleId);
    const path = (id) => `/runes/presets/${champion.id}/${preset.id}${id ?? ""}`;

    const applyButton = h(
      "button",
      {
        class: "btn btn-primary",
        disabled: !connected,
        onclick: () =>
          withBusy(applyButton, async () => {
            await api("POST", "/runes/apply", preset);
            toast(`Runes applied: ${preset.name}`, "success");
          }),
      },
      "Apply",
    );

    const remove = async () => {
      if (!confirm(`Delete "${preset.name}"?`)) return;
      try {
        await api("DELETE", path());
        await reloadPresets();
      } catch (error) {
        toast(error.message, "error");
      }
    };

    const makeDefault = async () => {
      try {
        await api("POST", path("/default"));
        await reloadPresets();
      } catch (error) {
        toast(error.message, "error");
      }
    };

    return h(
      "article",
      { class: "preset" },
      h(
        "div",
        { class: "preset-main" },
        h(
          "div",
          { class: "preset-icons" },
          keystone && h("img", { class: "keystone", src: keystone.icon, alt: "" }),
          secondary && h("img", { class: "substyle", src: secondary.icon, alt: "" }),
        ),
        h(
          "div",
          { class: "preset-info" },
          h("strong", {}, preset.name, isDefault && h("span", { class: "badge" }, "Default")),
          h("small", {}, [keystone?.name, primary?.name, secondary?.name].filter(Boolean).join(" · ")),
        ),
        applyButton,
      ),
      h(
        "div",
        { class: "preset-actions" },
        h("button", { class: "btn btn-ghost small", onclick: () => this.edit(champion, preset, preset) }, "Edit"),
        !isDefault && h("button", { class: "btn btn-ghost small", onclick: makeDefault }, "Set default"),
        h("button", { class: "btn btn-ghost small danger-text", onclick: remove }, "Delete"),
      ),
    );
  }

  /** Opens the editor to create (`preset` null) or update a favourite page. */
  edit(champion, preset, initial) {
    openRuneEditor({
      data: this.data,
      title: preset ? "Edit rune page" : `New page for ${champion.name}`,
      initial,
      defaultName: champion.name,
      onSave: async (page) => {
        if (preset) await api("PUT", `/runes/presets/${champion.id}/${preset.id}`, page);
        else await api("POST", `/runes/presets/${champion.id}`, page);
        await reloadPresets();
        toast("Page saved", "success");
      },
    });
  }

  pickChampion() {
    openChampionPicker(this.data, (id) => update({ runesChampionId: id }));
  }
}

function suggestedChampion(state) {
  const cs = state?.champSelect;
  if (!cs) return null;
  const me = cs.myTeam.find((p) => p.isLocalPlayer);
  return cs.lockedChampionId || me?.championId || me?.pickIntentId || null;
}

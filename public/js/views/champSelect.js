import { api } from "../api.js";
import { createChampionGrid } from "../components/championGrid.js";
import { openSpellPicker } from "../components/spellPicker.js";
import { update } from "../store.js";
import { h, POSITIONS, toast, vibrate, withBusy } from "../ui.js";

export class ChampSelectView {
  constructor(app) {
    this.data = app.data;
    this.selection = null; // { actionId, championId }
    this.pendingHover = false;
    this.deadline = null;
    this.runesKey = undefined;
    this.spellsKey = undefined;

    this.phaseEl = h("div", { class: "cs-phase" });
    this.timerEl = h("div", { class: "cs-timer" });
    this.allyEl = h("div", { class: "team ally" });
    this.enemyEl = h("div", { class: "team enemy" });
    this.runesEl = h("div", { class: "cs-runes" });
    this.spellsEl = h("div", { class: "cs-spells" });
    this.lockedEl = h("div", { class: "cs-locked" });

    this.searchEl = h("input", {
      type: "search",
      class: "search",
      placeholder: "Search a champion",
      autocomplete: "off",
      enterkeyhint: "search",
      oninput: () => this.renderGrid(),
    });
    this.grid = createChampionGrid(this.data, { onSelect: (id) => this.select(id) });
    this.emptyEl = h("p", { class: "muted empty" }, "No available champion matches your search.");
    this.pickArea = h("div", { class: "cs-pick" }, this.searchEl, this.grid.root, this.emptyEl);

    this.selectedImg = h("img", { alt: "" });
    this.selectedName = h("span");
    this.actionButton = h("button", { class: "btn btn-primary", onclick: () => this.lock() });
    this.actionBar = h(
      "div",
      { class: "actionbar" },
      h("div", { class: "actionbar-champ" }, h("div", { class: "actionbar-portrait" }, this.selectedImg), this.selectedName),
      this.actionButton,
    );

    this.el = h(
      "div",
      { class: "champ-select" },
      h("div", { class: "cs-head" }, this.phaseEl, this.timerEl),
      h("div", { class: "cs-teams" }, this.allyEl, this.enemyEl),
      this.spellsEl,
      this.runesEl,
      this.lockedEl,
      this.pickArea,
      this.actionBar,
    );

    this.interval = setInterval(() => this.tick(), 250);
  }

  /** The action the grid acts on: the current turn, or the upcoming pick to declare an intent. */
  get action() {
    return this.cs.currentAction ?? this.cs.nextPickAction;
  }

  get me() {
    return this.cs.myTeam.find((p) => p.isLocalPlayer);
  }

  update(app) {
    const previousAction = this.cs?.currentAction;
    this.app = app;
    this.cs = app.state.champSelect;
    this.deadline = this.cs.isInfinite ? null : performance.now() + this.cs.timeLeftMs;

    const action = this.action;
    if (!action) {
      this.selection = null;
    } else if (this.selection?.actionId !== action.id) {
      this.selection = { actionId: action.id, championId: action.championId };
    } else if (action.championId > 0 && !this.pendingHover) {
      // Follow hovers made from the PC.
      this.selection.championId = action.championId;
    }

    const current = this.cs.currentAction;
    if (current && current.id !== previousAction?.id) {
      vibrate(current.type === "ban" ? [100, 60, 100] : 200);
      this.searchEl.value = "";
    }

    this.renderHeader();
    this.renderTeams();
    this.renderGrid();
    this.renderActionBar();
    this.renderLocked();
    this.renderRunes();
    this.renderSpells();
    this.tick();
  }

  async select(championId) {
    const action = this.action;
    if (!action) return;
    this.selection = { actionId: action.id, championId };
    this.grid.setSelected(championId);
    this.renderActionBar();
    this.renderRunes();

    this.pendingHover = true;
    try {
      await api("POST", "/champ-select/hover", { championId });
    } catch (error) {
      toast(error.message, "error");
    } finally {
      this.pendingHover = false;
    }
  }

  lock() {
    const championId = this.selection?.championId;
    if (!championId || !this.cs.currentAction) return;
    return withBusy(this.actionButton, async () => {
      await api("POST", "/champ-select/lock", { championId });
      vibrate(60);
    });
  }

  renderHeader() {
    const { phase, currentAction } = this.cs;
    let text = "Waiting for other players";
    let urgent = false;

    if (phase === "PLANNING") text = "Planning: declare your pick";
    else if (phase === "FINALIZATION") text = "Finalization";
    else if (phase === "GAME_STARTING") text = "Game starting";
    else if (currentAction) {
      text = currentAction.type === "ban" ? "Your turn to ban" : "Your turn to pick";
      urgent = true;
    }

    this.phaseEl.textContent = text;
    this.el.classList.toggle("my-turn", urgent);
    this.el.classList.toggle("banning", currentAction?.type === "ban");
  }

  renderTeams() {
    const { myTeam, theirTeam, bans } = this.cs;
    this.allyEl.replaceChildren(this.bansRow(bans.ally), ...myTeam.map((p) => this.slot(p)));
    this.enemyEl.replaceChildren(this.bansRow(bans.enemy), ...theirTeam.map((p) => this.slot(p)));
    this.enemyEl.hidden = theirTeam.length === 0 && bans.enemy.length === 0;
  }

  slot(player) {
    const championId = player.championId || player.pickIntentId;
    const champion = this.data.championsById.get(championId);
    const isIntent = !player.championId && player.pickIntentId > 0;
    const details = [POSITIONS[player.position], player.name].filter(Boolean).join(" · ");

    return h(
      "div",
      { class: `slot${player.isLocalPlayer ? " me" : ""}${player.isActing ? " acting" : ""}` },
      h("div", { class: `portrait${isIntent ? " intent" : ""}` }, champion && h("img", { src: champion.image, alt: "" })),
      h(
        "div",
        { class: "slot-text" },
        h("span", { class: "slot-champ" }, champion?.name ?? (player.isActing ? "Choosing…" : "—")),
        details && h("span", { class: "slot-details" }, details),
      ),
    );
  }

  bansRow(ids) {
    return h(
      "div",
      { class: "bans" },
      ids.map((id) => {
        const champion = this.data.championsById.get(id);
        return champion && h("img", { src: champion.image, alt: champion.name, title: champion.name });
      }),
    );
  }

  renderGrid() {
    const action = this.action;
    this.pickArea.hidden = !action;
    if (!action) return;

    const list = action.type === "ban" ? this.cs.bannable : this.cs.pickable;
    // While the lists load, or if they match no known champion, show everything rather than an
    // empty grid: the League client still rejects champions that are not allowed.
    const known = list.filter((id) => this.data.championsById.has(id));
    const allowed = known.length > 0 ? new Set(known) : null;
    const taken = new Set(this.cs.unavailable);

    const visible = this.grid.filter(this.searchEl.value, (id) => (!allowed || allowed.has(id)) && !taken.has(id));
    this.emptyEl.hidden = visible > 0;
    this.grid.setSelected(this.selection?.championId);
  }

  renderActionBar() {
    const action = this.action;
    this.actionBar.hidden = !action;
    if (!action) return;

    const champion = this.data.championsById.get(this.selection?.championId);
    this.selectedImg.hidden = !champion;
    if (champion) this.selectedImg.src = champion.image;

    const current = this.cs.currentAction;
    const isBan = current?.type === "ban";
    this.selectedName.textContent = champion?.name ?? (current ? "Choose a champion" : "Tap to declare your pick");
    this.actionButton.textContent = !current ? "Not your turn" : isBan ? "Ban" : "Lock in";
    this.actionButton.className = `btn ${isBan ? "btn-danger" : "btn-primary"}`;
    this.actionButton.disabled = !current || !champion;
  }

  renderLocked() {
    const champion = this.data.championsById.get(this.cs.lockedChampionId);
    this.lockedEl.hidden = !champion || Boolean(this.action);
    if (!champion) return;
    this.lockedEl.replaceChildren(
      h("img", { src: champion.image, alt: "" }),
      h("div", {}, h("small", {}, "Locked in"), h("strong", {}, champion.name)),
    );
  }

  /** Suggests the favourite rune page of the champion the player is going to play. */
  renderRunes() {
    const me = this.me;
    const championId =
      this.cs.lockedChampionId ||
      (this.action?.type === "pick" ? this.selection?.championId : 0) ||
      me?.championId ||
      me?.pickIntentId ||
      0;
    const champion = this.data.championsById.get(championId);
    const presets = (champion && this.app.presets[championId]) || [];

    const key = champion ? `${championId}:${presets.map((p) => p.id).join(",")}` : null;
    if (key === this.runesKey) return;
    this.runesKey = key;

    this.runesEl.hidden = !champion;
    if (!champion) return;

    const openRunes = () => update({ tab: "runes", runesChampionId: championId });

    if (presets.length === 0) {
      this.runesEl.replaceChildren(
        h("span", { class: "cs-runes-text" }, `No saved runes for ${champion.name}`),
        h("button", { class: "btn small", onclick: openRunes }, "Create"),
      );
      return;
    }

    const picker = h(
      "select",
      { class: "cs-runes-select", "aria-label": "Rune page" },
      presets.map((preset) => h("option", { value: preset.id }, preset.name)),
    );
    const apply = h(
      "button",
      {
        class: "btn btn-primary small",
        onclick: () =>
          withBusy(apply, async () => {
            const preset = presets.find((p) => p.id === picker.value);
            await api("POST", "/runes/apply", preset);
            toast(`Runes applied: ${preset.name}`, "success");
          }),
      },
      "Apply runes",
    );

    const keystone = this.data.perks.get(presets[0].selectedPerkIds[0]);
    this.runesEl.replaceChildren(
      keystone && h("img", { class: "cs-runes-keystone", src: keystone.icon, alt: "" }),
      presets.length > 1 ? picker : h("span", { class: "cs-runes-text" }, presets[0].name),
      apply,
    );
  }

  renderSpells() {
    const me = this.me;
    const visible = Boolean(me) && this.cs.phase !== "GAME_STARTING";
    const key = visible ? `${me.spell1Id}:${me.spell2Id}:${this.cs.gameMode}` : null;
    if (key === this.spellsKey) return;
    this.spellsKey = key;

    this.spellsEl.hidden = !visible;
    if (!visible) return;

    const current = [me.spell1Id, me.spell2Id];
    const choose = (slot) =>
      openSpellPicker(this.data, {
        gameMode: this.cs.gameMode,
        currentId: current[slot],
        onPick: async (id) => {
          const keys = ["spell1Id", "spell2Id"];
          // Picking the spell of the other slot swaps them, like in the client.
          const body =
            current[1 - slot] === id && current[slot] > 0
              ? { [keys[slot]]: id, [keys[1 - slot]]: current[slot] }
              : { [keys[slot]]: id };
          try {
            await api("POST", "/champ-select/spells", body);
          } catch (error) {
            toast(error.message, "error");
          }
        },
      });

    this.spellsEl.replaceChildren(
      h("span", { class: "cs-spells-label" }, "Spells"),
      ...current.map((id, slot) => {
        const spell = this.data.spellsById.get(id);
        return h(
          "button",
          { type: "button", class: "spell-slot", onclick: () => choose(slot), "aria-label": `Spell ${slot === 0 ? "D" : "F"}` },
          spell ? h("img", { src: spell.image, alt: "" }) : h("span", {}, "?"),
          h("small", {}, spell?.name ?? "Choose"),
        );
      }),
    );
  }

  tick() {
    if (this.deadline === null) {
      this.timerEl.textContent = this.cs?.isInfinite ? "∞" : "";
      return;
    }
    const seconds = Math.max(0, Math.ceil((this.deadline - performance.now()) / 1000));
    this.timerEl.textContent = String(seconds);
    this.timerEl.classList.toggle("low", seconds <= 5 && Boolean(this.cs.currentAction));
  }

  destroy() {
    clearInterval(this.interval);
  }
}

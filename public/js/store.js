import { api } from "./api.js";

/** Client-side application state shared by every view. */
export const app = {
  /** Snapshot pushed by the server. */
  state: null,
  online: false,
  /** Static game data from Data Dragon. */
  data: null,
  /** Favourite rune pages keyed by champion id. */
  presets: {},
  tab: "play",
  /** Champion currently shown in the Runes tab. */
  runesChampionId: null,
};

const listeners = new Set();

export function update(patch) {
  Object.assign(app, patch);
  for (const listener of listeners) listener(app);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function reloadPresets() {
  update({ presets: await api("GET", "/runes/presets") });
}

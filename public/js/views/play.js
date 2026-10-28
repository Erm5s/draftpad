import { ReadyCheckView } from "./readyCheck.js";
import { StatusView } from "./status.js";

function viewKey(state) {
  if (!state || state.connection !== "connected") return "offline";
  if (state.readyCheck && (state.phase === "ReadyCheck" || state.readyCheck.state === "InProgress")) {
    return "readyCheck";
  }
  return "status";
}

const VIEWS = {
  offline: StatusView,
  status: StatusView,
  readyCheck: ReadyCheckView,
};

/** "Play" tab: swaps between status, ready check and champion select screens. */
export class PlayView {
  constructor(root) {
    this.root = root;
    this.key = null;
    this.view = null;
  }

  update(app) {
    const key = viewKey(app.state);
    if (key !== this.key || !this.view) {
      this.view?.destroy?.();
      this.view = new VIEWS[key](app);
      this.root.replaceChildren(this.view.el);
      this.key = key;
    }
    this.view.update(app);
  }
}

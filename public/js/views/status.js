import { autoAcceptToggle } from "../components/autoAccept.js";
import { h } from "../ui.js";

const PHASES = {
  None: ["Client ready", "Create a lobby on your PC to start."],
  Lobby: ["In lobby", "Start the queue whenever you are ready."],
  Matchmaking: ["Searching for a match…", "Keep this page open, you will be able to accept from here."],
  ReadyCheck: ["Match found", ""],
  ChampSelect: ["Champion select", "Loading the draft…"],
  GameStart: ["Game starting", "Good luck, have fun!"],
  InProgress: ["Game in progress", "Nothing to do here until the end of the game."],
  Reconnect: ["Reconnect needed", "Reconnect to your game from the PC."],
  WaitingForStats: ["Game over", "Waiting for the stats…"],
  PreEndOfGame: ["Game over", ""],
  EndOfGame: ["Game over", "Head back to the lobby for another one."],
};

/** Simple informational screens: client offline, lobby, queue, in game... */
export class StatusView {
  constructor() {
    this.el = h("div", { class: "status-view" });
  }

  update(app) {
    const state = app.state;
    if (!state || state.connection !== "connected") {
      this.el.replaceChildren(
        h(
          "div",
          { class: "hero" },
          h("div", { class: "spinner" }),
          h("h1", {}, "Waiting for League of Legends"),
          h("p", { class: "muted" }, "Start the League client on your PC. Draftpad will connect automatically."),
        ),
      );
      return;
    }

    const [title, subtitle] = PHASES[state.phase] ?? [state.phase, ""];
    const searching = state.phase === "Matchmaking";
    this.el.replaceChildren(
      h(
        "div",
        { class: "hero" },
        h("div", { class: searching ? "pulse" : "hero-icon" }),
        h("h1", {}, title),
        subtitle && h("p", { class: "muted" }, subtitle),
      ),
      autoAcceptToggle(state.autoAccept),
    );
  }
}

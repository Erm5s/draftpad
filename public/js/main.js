import { AuthError, api, connectRealtime, forgetPin, hasPin, login } from "./api.js";
import { loadGameData } from "./ddragon.js";
import { app, reloadPresets, subscribe, update } from "./store.js";
import { h, toast } from "./ui.js";
import { showLogin } from "./views/login.js";
import { PlayView } from "./views/play.js";

const PHASE_LABELS = {
  None: "Idle",
  Lobby: "Lobby",
  Matchmaking: "In queue",
  ReadyCheck: "Match found",
  ChampSelect: "Champ select",
  GameStart: "Loading",
  InProgress: "In game",
  WaitingForStats: "Post game",
  PreEndOfGame: "Post game",
  EndOfGame: "Post game",
};

const playRoot = document.getElementById("tab-play");
const tabbar = document.getElementById("tabbar");

async function authenticate() {
  // A QR code from the console carries the PIN: use it once, then hide it from the URL.
  const params = new URLSearchParams(location.search);
  const urlPin = params.get("pin");
  if (urlPin) {
    history.replaceState(null, "", location.pathname);
    try {
      await login(urlPin);
      return;
    } catch {}
  }

  if (hasPin()) {
    try {
      await api("GET", "/state");
      return;
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      forgetPin();
      return showLogin(playRoot, "The PIN has changed, enter the new one.");
    }
  }
  return showLogin(playRoot);
}

function renderStatus() {
  const el = document.getElementById("status");
  const state = app.state;
  let label = "Offline";
  let kind = "off";
  if (app.online && state?.connection === "connected") {
    label = PHASE_LABELS[state.phase] ?? state.phase;
    kind = "on";
  } else if (app.online) {
    label = "No client";
    kind = "wait";
  }
  el.replaceChildren(h("span", { class: `dot ${kind}` }), label);
  document.getElementById("banner").hidden = app.online || app.state === null;
}

function setupTabs() {
  tabbar.hidden = false;
  tabbar.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tab]");
    if (button) update({ tab: button.dataset.tab });
  });
  subscribe(({ tab }) => {
    for (const button of tabbar.querySelectorAll("button")) {
      button.classList.toggle("active", button.dataset.tab === tab);
    }
    for (const section of document.querySelectorAll(".tab")) {
      section.hidden = section.id !== `tab-${tab}`;
    }
  });
}

async function main() {
  playRoot.replaceChildren(h("div", { class: "hero" }, h("div", { class: "spinner" })));
  await authenticate();
  playRoot.replaceChildren(h("div", { class: "hero" }, h("div", { class: "spinner" }), h("p", { class: "muted" }, "Loading game data…")));

  try {
    const [data] = await Promise.all([loadGameData(), reloadPresets()]);
    app.data = data;
  } catch (error) {
    playRoot.replaceChildren(
      h(
        "div",
        { class: "hero" },
        h("h1", {}, "Could not load game data"),
        h("p", { class: "muted" }, `${error.message}. Your phone needs Internet access for champion images.`),
        h("button", { class: "btn btn-primary", onclick: () => location.reload() }, "Retry"),
      ),
    );
    return;
  }

  const play = new PlayView(playRoot);
  subscribe((state) => {
    renderStatus();
    if (state.state) play.update(state);
  });
  setupTabs();

  connectRealtime({
    onState: (state) => update({ state }),
    onOnline: (online) => {
      update({ online });
      // A restarted server may have generated a new PIN.
      if (!online) {
        api("GET", "/state").catch((error) => {
          if (error instanceof AuthError) {
            forgetPin();
            location.reload();
          }
        });
      }
    },
  });
}

main().catch((error) => toast(error.message, "error"));

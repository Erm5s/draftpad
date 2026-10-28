import { api } from "../api.js";
import { autoAcceptToggle } from "../components/autoAccept.js";
import { h, vibrate, withBusy } from "../ui.js";

const READY_CHECK_SECONDS = 12;

export class ReadyCheckView {
  constructor() {
    this.startedAt = null;
    this.acceptButton = h(
      "button",
      { class: "accept-button", onclick: () => withBusy(this.acceptButton, () => api("POST", "/ready-check/accept")) },
      h("span", { class: "accept-label" }, "Accept"),
      (this.countdown = h("span", { class: "accept-countdown" })),
    );
    this.declineButton = h(
      "button",
      { class: "btn btn-ghost", onclick: () => withBusy(this.declineButton, () => api("POST", "/ready-check/decline")) },
      "Decline",
    );
    this.title = h("h1", {}, "Match found!");
    this.message = h("p", { class: "muted" });
    this.toggleSlot = h("div");

    this.el = h(
      "div",
      { class: "ready-check" },
      this.title,
      this.message,
      (this.ring = h("div", { class: "accept-ring" }, this.acceptButton)),
      this.declineButton,
      this.toggleSlot,
    );

    this.interval = setInterval(() => this.tick(), 100);
    vibrate([300, 150, 300]);
  }

  update(app) {
    const readyCheck = app.state.readyCheck;
    if (!readyCheck) return;

    // Re-sync the countdown only when it drifted, to keep the animation smooth.
    const startedAt = performance.now() - readyCheck.timer * 1000;
    if (this.startedAt === null || Math.abs(startedAt - this.startedAt) > 1000) {
      this.startedAt = startedAt;
    }

    const response = readyCheck.playerResponse;
    this.el.dataset.response = response;
    this.ring.hidden = response !== "None";
    this.declineButton.hidden = response !== "None";

    if (response === "Accepted") {
      this.title.textContent = "Accepted";
      this.message.textContent = "Waiting for the other players…";
    } else if (response === "Declined") {
      this.title.textContent = "Declined";
      this.message.textContent = "You declined this match.";
    } else {
      this.title.textContent = "Match found!";
      this.message.textContent = "";
    }

    this.toggleSlot.replaceChildren(autoAcceptToggle(app.state.autoAccept));
    this.tick();
  }

  tick() {
    if (this.startedAt === null) return;
    const left = Math.max(0, READY_CHECK_SECONDS - (performance.now() - this.startedAt) / 1000);
    this.el.style.setProperty("--progress", String(left / READY_CHECK_SECONDS));
    this.countdown.textContent = `${Math.ceil(left)}s`;
  }

  destroy() {
    clearInterval(this.interval);
  }
}

import { h } from "../ui.js";

/** Full-screen bottom sheet. Returns a `close` function. */
export function openSheet({ title, body, footer }) {
  const close = () => {
    overlay.remove();
    document.body.classList.remove("sheet-open");
  };

  const overlay = h(
    "div",
    { class: "sheet-overlay" },
    h(
      "div",
      { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title },
      h(
        "header",
        { class: "sheet-header" },
        h("h2", {}, title),
        h("button", { class: "btn btn-ghost small", type: "button", onclick: close, "aria-label": "Close" }, "✕"),
      ),
      h("div", { class: "sheet-body" }, body),
      footer && h("footer", { class: "sheet-footer" }, footer),
    ),
  );

  document.body.append(overlay);
  document.body.classList.add("sheet-open");
  return close;
}

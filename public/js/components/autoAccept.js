import { api } from "../api.js";
import { h, toast } from "../ui.js";

export function autoAcceptToggle(enabled) {
  const input = h("input", {
    type: "checkbox",
    checked: enabled,
    onchange: async () => {
      input.disabled = true;
      try {
        await api("PUT", "/settings/auto-accept", { enabled: input.checked });
      } catch (error) {
        input.checked = !input.checked;
        toast(error.message, "error");
      } finally {
        input.disabled = false;
      }
    },
  });

  return h(
    "label",
    { class: "toggle-card" },
    h(
      "span",
      { class: "toggle-text" },
      h("strong", {}, "Auto-accept"),
      h("small", {}, "Accept matches as soon as they are found"),
    ),
    input,
    h("span", { class: "switch", "aria-hidden": "true" }),
  );
}

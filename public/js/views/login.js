import { login } from "../api.js";
import { h } from "../ui.js";

/** Full-screen PIN prompt. Resolves once the server accepted the PIN. */
export function showLogin(root, initialError) {
  return new Promise((resolve) => {
    const input = h("input", {
      class: "pin-input",
      type: "password",
      inputmode: "numeric",
      autocomplete: "one-time-code",
      pattern: "[0-9]*",
      maxlength: "12",
      placeholder: "••••••",
      "aria-label": "PIN",
    });
    const error = h("p", { class: "login-error" }, initialError ?? "");
    const button = h("button", { class: "btn btn-primary big", type: "submit" }, "Connect");

    const form = h(
      "form",
      {
        class: "login",
        onsubmit: async (event) => {
          event.preventDefault();
          button.disabled = true;
          error.textContent = "";
          try {
            await login(input.value.trim());
            resolve();
          } catch (e) {
            error.textContent = e.message;
            input.select();
          } finally {
            button.disabled = false;
          }
        },
      },
      h("div", { class: "login-icon" }, h("img", { src: "icon.svg", alt: "" })),
      h("h1", {}, "Enter PIN"),
      h("p", { class: "muted" }, "The PIN is shown in the Draftpad console on your PC."),
      input,
      error,
      button,
    );

    root.replaceChildren(form);
    input.focus();
  });
}

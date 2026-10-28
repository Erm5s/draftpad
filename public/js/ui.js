/** Tiny element builder: h("button", { class: "btn", onclick }, "Label"). */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== "string") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  el.append(...children.flat().filter((child) => child != null && child !== false));
  return el;
}

let toastTimer;

export function toast(message, kind = "info") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 2600);
}

export function vibrate(pattern) {
  navigator.vibrate?.(pattern);
}

/** Runs an async action while disabling the button, reporting errors as a toast. */
export async function withBusy(button, action) {
  button.disabled = true;
  button.classList.add("busy");
  try {
    return await action();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.classList.remove("busy");
  }
}

/** Lowercase alphanumerics only, so "kaisa" matches "Kai'Sa". */
export function normalizeSearch(text) {
  return text.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
}

export const POSITIONS = {
  top: "Top",
  jungle: "Jungle",
  middle: "Mid",
  bottom: "Bot",
  utility: "Support",
};

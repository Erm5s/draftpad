const PIN_KEY = "draftpad.pin";
let pin = readStoredPin();

export class AuthError extends Error {}

function readStoredPin() {
  try {
    return localStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}

export function hasPin() {
  return Boolean(pin);
}

export function forgetPin() {
  pin = null;
  try {
    localStorage.removeItem(PIN_KEY);
  } catch {}
}

/** Checks the PIN against the server and remembers it on success. */
export async function login(candidate) {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: candidate }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Invalid PIN");
  }
  pin = candidate;
  try {
    localStorage.setItem(PIN_KEY, candidate);
  } catch {}
}

export async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "x-draftpad-pin": pin ?? "",
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) throw new AuthError("Invalid PIN");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? undefined : res.json();
}

/** Keeps a WebSocket open to receive state snapshots, reconnecting with backoff. */
export function connectRealtime({ onState, onOnline }) {
  let socket = null;
  let timer = null;
  let attempt = 0;

  const open = () => {
    clearTimeout(timer);
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${protocol}://${location.host}/ws?pin=${encodeURIComponent(pin ?? "")}`);

    socket.onopen = () => {
      attempt = 0;
      onOnline(true);
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "state") onState(message.state);
    };
    socket.onclose = () => {
      onOnline(false);
      timer = setTimeout(open, Math.min(5000, 500 * 2 ** attempt++));
    };
  };

  // A phone that slept may keep a dead socket that still looks open:
  // always start a fresh connection, which also sends the latest state.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || socket?.readyState === WebSocket.CONNECTING) return;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    attempt = 0;
    open();
  });

  open();
}

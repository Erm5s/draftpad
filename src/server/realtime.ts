import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { StateStore } from "../state.js";
import type { PinAuth } from "./auth.js";
import { isPrivateAddress, normalizeIp } from "./network.js";

const HEARTBEAT_MS = 15_000;

/** Pushes every state change to connected phones over `/ws?pin=...`. */
export function attachRealtime(server: Server, store: StateStore, auth: PinAuth): void {
  const wss = new WebSocketServer({ noServer: true });
  const alive = new WeakSet<WebSocket>();

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const ip = normalizeIp(req.socket.remoteAddress ?? "");

    if (url.pathname !== "/ws" || !isPrivateAddress(ip)) {
      socket.destroy();
      return;
    }
    if (auth.check(url.searchParams.get("pin"), ip) !== "ok") {
      socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws) => {
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    ws.send(JSON.stringify({ type: "state", state: store.get() }));
  });

  store.on("change", (state) => {
    const message = JSON.stringify({ type: "state", state });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(message);
    }
  });

  // Drop phones that went to sleep without closing the socket.
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!alive.has(client)) {
        client.terminate();
        continue;
      }
      alive.delete(client);
      client.ping();
    }
  }, HEARTBEAT_MS);
  server.on("close", () => clearInterval(heartbeat));
}

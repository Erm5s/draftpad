import WebSocket from "ws";
import { LCU_HOST, basicAuth } from "./client.js";
import type { LcuCredentials } from "./lockfile.js";

/** WAMP 1.0 message type ids used by the LCU. */
const WAMP_SUBSCRIBE = 5;
const WAMP_EVENT = 8;

export interface LcuEvent {
  uri: string;
  eventType: "Create" | "Update" | "Delete";
  data: unknown;
}

/**
 * Opens the LCU WebSocket and subscribes to the given `OnJsonApiEvent` topics.
 * Resolves once the socket is open; events are delivered through `onEvent`.
 */
export function openLcuSocket(
  credentials: LcuCredentials,
  topics: readonly string[],
  onEvent: (event: LcuEvent) => void,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`wss://${LCU_HOST}:${credentials.port}/`, "wamp", {
      headers: { Authorization: basicAuth(credentials.password) },
      // Self-signed certificate on the loopback interface only.
      rejectUnauthorized: false,
      handshakeTimeout: 5_000,
    });

    socket.once("open", () => {
      for (const topic of topics) {
        socket.send(JSON.stringify([WAMP_SUBSCRIBE, topic]));
      }
      resolve(socket);
    });

    // Keep a listener for the socket's whole life: an unhandled `error` event would crash the process.
    // Rejecting after the promise settled is a no-op.
    socket.on("error", reject);

    socket.on("message", (raw) => {
      const event = parseEvent(raw.toString());
      if (event) onEvent(event);
    });
  });
}

function parseEvent(text: string): LcuEvent | null {
  if (!text) return null;
  try {
    const message = JSON.parse(text) as unknown[];
    if (message[0] !== WAMP_EVENT) return null;
    const payload = message[2] as LcuEvent | undefined;
    return payload && typeof payload.uri === "string" ? payload : null;
  } catch {
    return null;
  }
}

/** Builds the topic name for a single endpoint, e.g. `OnJsonApiEvent_lol-gameflow_v1_gameflow-phase`. */
export function topicFor(uri: string): string {
  return `OnJsonApiEvent${uri.replaceAll("/", "_")}`;
}

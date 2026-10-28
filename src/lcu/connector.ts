import { EventEmitter } from "node:events";
import type WebSocket from "ws";
import { LcuHttpClient } from "./client.js";
import { readLockfile } from "./lockfile.js";
import { openLcuSocket, topicFor, type LcuEvent } from "./socket.js";

export type ConnectionStatus = "waiting" | "connecting" | "connected";

interface ConnectorEvents {
  status: [ConnectionStatus];
  connected: [LcuHttpClient];
  disconnected: [];
  event: [LcuEvent];
}

const RETRY_DELAY_MS = 2_000;

export class NotConnectedError extends Error {
  constructor() {
    super("League client is not connected");
    this.name = "NotConnectedError";
  }
}

/**
 * Watches the lockfile, connects to the client when it starts and
 * reconnects automatically when it restarts or closes.
 */
export class LcuConnector extends EventEmitter<ConnectorEvents> {
  private socket: WebSocket | null = null;
  private http: LcuHttpClient | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private currentStatus: ConnectionStatus = "waiting";
  private readonly topics: string[];
  private lastError: string | null = null;

  constructor(
    private readonly lockfilePath: string,
    uris: readonly string[],
  ) {
    super();
    this.topics = uris.map(topicFor);
  }

  get status(): ConnectionStatus {
    return this.currentStatus;
  }

  /** Returns the HTTP client, or throws when the League client is not running. */
  get client(): LcuHttpClient {
    if (!this.http) throw new NotConnectedError();
    return this.http;
  }

  start(): void {
    this.stopped = false;
    void this.tryConnect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
  }

  private async tryConnect(): Promise<void> {
    if (this.stopped) return;

    try {
      const credentials = await readLockfile(this.lockfilePath);
      if (!credentials) {
        this.setStatus("waiting");
        return this.scheduleRetry();
      }

      this.setStatus("connecting");
      const socket = await openLcuSocket(credentials, this.topics, (event) =>
        this.emit("event", event),
      );

      this.socket = socket;
      this.http = new LcuHttpClient(credentials);
      this.lastError = null;
      socket.once("close", () => this.handleClose());
      socket.on("error", () => socket.close());

      this.setStatus("connected");
      this.emit("connected", this.http);
    } catch (error) {
      // The lockfile can outlive a crashed client, so keep retrying quietly.
      const message = (error as Error).message;
      if (message !== this.lastError) {
        console.warn(`[lcu] connection failed: ${message}`);
        this.lastError = message;
      }
      this.setStatus("waiting");
      this.scheduleRetry();
    }
  }

  private handleClose(): void {
    this.socket = null;
    this.http?.dispose();
    this.http = null;
    this.setStatus("waiting");
    this.emit("disconnected");
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tryConnect(), RETRY_DELAY_MS);
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.currentStatus) return;
    this.currentStatus = status;
    console.log(`[lcu] ${status}`);
    this.emit("status", status);
  }
}

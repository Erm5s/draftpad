import { EventEmitter } from "node:events";
import type { ConnectionStatus } from "./lcu/connector.js";
import type { ChampSelectState } from "./services/champSelect.js";
import type { ReadyCheckState } from "./services/readyCheck.js";

/** Snapshot pushed to every connected phone. */
export interface AppState {
  connection: ConnectionStatus;
  /** Raw gameflow phase from the client: None, Lobby, Matchmaking, ReadyCheck, ChampSelect, InProgress... */
  phase: string;
  readyCheck: ReadyCheckState | null;
  autoAccept: boolean;
  champSelect: ChampSelectState | null;
}

/** Holds the current state and emits a single coalesced `change` per tick. */
export class StateStore extends EventEmitter<{ change: [AppState] }> {
  private state: AppState;
  private pending = false;

  constructor(initial: AppState) {
    super();
    this.state = initial;
  }

  get(): AppState {
    return this.state;
  }

  update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      this.emit("change", this.state);
    });
  }
}

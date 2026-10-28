import { LcuError } from "../lcu/client.js";
import type { LcuConnector } from "../lcu/connector.js";
import type { StateStore } from "../state.js";
import type { JsonFile } from "../storage/jsonFile.js";
import type { Settings } from "../storage/settings.js";

export const READY_CHECK_URI = "/lol-matchmaking/v1/ready-check";

export interface ReadyCheckState {
  /** InProgress, EveryoneReady, StrangerNotReady, PartyNotReady, Error... */
  state: string;
  /** None, Accepted or Declined. */
  playerResponse: string;
  /** Seconds elapsed since the ready check appeared. */
  timer: number;
}

interface LcuReadyCheck {
  state: string;
  playerResponse: string;
  timer: number;
}

export class ReadyCheckService {
  private accepting = false;

  constructor(
    private readonly lcu: LcuConnector,
    private readonly store: StateStore,
    private readonly settings: JsonFile<Settings>,
  ) {
    lcu.on("connected", () => void this.refresh());
    lcu.on("disconnected", () => store.update({ readyCheck: null }));
    lcu.on("event", (event) => {
      if (event.uri !== READY_CHECK_URI) return;
      this.handle(event.eventType === "Delete" ? null : (event.data as LcuReadyCheck | null));
    });
  }

  async init(): Promise<void> {
    const { autoAccept } = await this.settings.read();
    this.store.update({ autoAccept });
  }

  async accept(): Promise<void> {
    await this.lcu.client.post(`${READY_CHECK_URI}/accept`);
  }

  async decline(): Promise<void> {
    await this.lcu.client.post(`${READY_CHECK_URI}/decline`);
  }

  async setAutoAccept(enabled: boolean): Promise<void> {
    await this.settings.write({ ...(await this.settings.read()), autoAccept: enabled });
    this.store.update({ autoAccept: enabled });
    const current = this.store.get().readyCheck;
    if (enabled && current) this.maybeAutoAccept(current);
  }

  private async refresh(): Promise<void> {
    try {
      this.handle(await this.lcu.client.get<LcuReadyCheck>(READY_CHECK_URI));
    } catch (error) {
      // 404 simply means there is no ready check right now.
      if (!(error instanceof LcuError && error.status === 404)) {
        console.warn(`[ready-check] ${(error as Error).message}`);
      }
      this.handle(null);
    }
  }

  private handle(data: LcuReadyCheck | null): void {
    const readyCheck = data && data.state !== "Invalid" ? normalize(data) : null;
    this.store.update({ readyCheck });
    if (readyCheck) this.maybeAutoAccept(readyCheck);
  }

  private maybeAutoAccept(readyCheck: ReadyCheckState): void {
    if (
      !this.store.get().autoAccept ||
      this.accepting ||
      readyCheck.state !== "InProgress" ||
      readyCheck.playerResponse !== "None"
    ) {
      return;
    }

    this.accepting = true;
    this.accept()
      .then(() => console.log("[ready-check] accepted automatically"))
      .catch((error: Error) => console.warn(`[ready-check] auto-accept failed: ${error.message}`))
      .finally(() => (this.accepting = false));
  }
}

function normalize(data: LcuReadyCheck): ReadyCheckState {
  return {
    state: data.state,
    playerResponse: data.playerResponse,
    timer: data.timer,
  };
}

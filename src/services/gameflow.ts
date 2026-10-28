import type { LcuConnector } from "../lcu/connector.js";
import type { StateStore } from "../state.js";

export const GAMEFLOW_PHASE_URI = "/lol-gameflow/v1/gameflow-phase";

/** Tracks the client gameflow phase (lobby, queue, champ select, in game...). */
export class GameflowService {
  constructor(
    private readonly lcu: LcuConnector,
    private readonly store: StateStore,
  ) {
    lcu.on("status", (connection) => store.update({ connection }));
    lcu.on("connected", () => void this.refresh());
    lcu.on("disconnected", () => store.update({ phase: "None" }));
    lcu.on("event", (event) => {
      if (event.uri === GAMEFLOW_PHASE_URI && typeof event.data === "string") {
        store.update({ phase: event.data });
      }
    });
  }

  private async refresh(): Promise<void> {
    try {
      const phase = await this.lcu.client.get<string>(GAMEFLOW_PHASE_URI);
      this.store.update({ phase });
    } catch (error) {
      console.warn(`[gameflow] ${(error as Error).message}`);
    }
  }
}

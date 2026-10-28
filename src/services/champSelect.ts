import { LcuError } from "../lcu/client.js";
import type { LcuConnector } from "../lcu/connector.js";
import { badRequest, HttpError } from "../server/errors.js";
import type { StateStore } from "../state.js";

export const CHAMP_SELECT_SESSION_URI = "/lol-champ-select/v1/session";
const PICKABLE_URI = "/lol-champ-select/v1/pickable-champion-ids";
const BANNABLE_URI = "/lol-champ-select/v1/bannable-champion-ids";

export interface ChampSelectPlayer {
  cellId: number;
  championId: number;
  pickIntentId: number;
  position: string;
  name: string | null;
  isLocalPlayer: boolean;
  /** True while this player has a pick or ban in progress. */
  isActing: boolean;
}

export interface ChampSelectAction {
  id: number;
  type: "pick" | "ban";
  championId: number;
  isInProgress: boolean;
}

export interface ChampSelectState {
  /** PLANNING, BAN_PICK, FINALIZATION or GAME_STARTING. */
  phase: string;
  /** Remaining time when the snapshot was taken; the phone runs the countdown. */
  timeLeftMs: number;
  totalTimeMs: number;
  isInfinite: boolean;
  localPlayerCellId: number;
  myTeam: ChampSelectPlayer[];
  theirTeam: ChampSelectPlayer[];
  bans: { ally: number[]; enemy: number[] };
  /** Action the player must complete right now, if any. */
  currentAction: ChampSelectAction | null;
  /** Next pick of the player, used to declare an intent before their turn. */
  nextPickAction: ChampSelectAction | null;
  /** Champion locked in by the player, 0 if none. */
  lockedChampionId: number;
  /** Champions already picked or banned by anyone. */
  unavailable: number[];
  pickable: number[];
  bannable: number[];
}

interface LcuAction {
  id: number;
  actorCellId: number;
  championId: number;
  completed: boolean;
  isAllyAction: boolean;
  isInProgress: boolean;
  type: string;
}

interface LcuPlayer {
  cellId: number;
  championId: number;
  championPickIntent: number;
  assignedPosition: string;
  gameName?: string;
}

interface LcuSession {
  actions: LcuAction[][];
  bans?: { myTeamBans: number[]; theirTeamBans: number[] };
  localPlayerCellId: number;
  myTeam: LcuPlayer[];
  theirTeam: LcuPlayer[];
  timer: {
    adjustedTimeLeftInPhase: number;
    totalTimeInPhase: number;
    isInfinite: boolean;
    phase: string;
  };
}

export class ChampSelectService {
  private pickable: number[] = [];
  private bannable: number[] = [];
  private availabilityKey = "";

  constructor(
    private readonly lcu: LcuConnector,
    private readonly store: StateStore,
  ) {
    lcu.on("connected", () => void this.refresh());
    lcu.on("disconnected", () => this.handle(null));
    lcu.on("event", (event) => {
      if (event.uri !== CHAMP_SELECT_SESSION_URI) return;
      this.handle(event.eventType === "Delete" ? null : (event.data as LcuSession));
    });
  }

  /** Shows a champion without locking it (or declares the pick intent before the player's turn). */
  async hover(championId: number): Promise<void> {
    const session = this.requireSession();
    const action = session.currentAction ?? session.nextPickAction;
    if (!action) throw new HttpError(409, "No pick or ban to prepare");

    this.assertAvailable(session, action.type, championId);
    await this.patchAction(action.id, { championId });
  }

  /** Locks in a pick or confirms a ban for the action in progress. */
  async lock(championId: number): Promise<void> {
    const session = this.requireSession();
    const action = session.currentAction;
    if (!action) throw new HttpError(409, "It is not your turn");

    this.assertAvailable(session, action.type, championId);
    await this.patchAction(action.id, { championId, completed: true });
  }

  private async refresh(): Promise<void> {
    try {
      this.handle(await this.lcu.client.get<LcuSession>(CHAMP_SELECT_SESSION_URI));
    } catch (error) {
      if (!(error instanceof LcuError && error.status === 404)) {
        console.warn(`[champ-select] ${(error as Error).message}`);
      }
      this.handle(null);
    }
  }

  private handle(session: LcuSession | null): void {
    if (!session) {
      this.pickable = [];
      this.bannable = [];
      this.availabilityKey = "";
      this.store.update({ champSelect: null });
      return;
    }

    const state = normalize(session, this.pickable, this.bannable);
    this.store.update({ champSelect: state });

    // Pickable/bannable lists only change when an action completes or a turn starts.
    const key = availabilityKey(session);
    if (key !== this.availabilityKey) {
      this.availabilityKey = key;
      void this.refreshAvailability();
    }
  }

  private async refreshAvailability(): Promise<void> {
    try {
      const [pickable, bannable] = await Promise.all([
        this.lcu.client.get<number[]>(PICKABLE_URI),
        this.lcu.client.get<number[]>(BANNABLE_URI),
      ]);
      this.pickable = pickable;
      this.bannable = bannable;

      const current = this.store.get().champSelect;
      if (current) this.store.update({ champSelect: { ...current, pickable, bannable } });
    } catch (error) {
      console.warn(`[champ-select] could not load available champions: ${(error as Error).message}`);
    }
  }

  private requireSession(): ChampSelectState {
    const session = this.store.get().champSelect;
    if (!session) throw new HttpError(409, "Not in champion select");
    return session;
  }

  private assertAvailable(session: ChampSelectState, type: "pick" | "ban", championId: number): void {
    if (!Number.isInteger(championId) || championId <= 0) {
      throw badRequest("`championId` must be a positive integer");
    }
    const allowed = type === "pick" ? session.pickable : session.bannable;
    // Lists may still be loading; let the client be the judge in that case.
    if (allowed.length > 0 && !allowed.includes(championId)) {
      throw new HttpError(409, `This champion cannot be ${type === "pick" ? "picked" : "banned"}`);
    }
  }

  private async patchAction(actionId: number, body: { championId: number; completed?: boolean }) {
    await this.lcu.client.patch(`${CHAMP_SELECT_SESSION_URI}/actions/${actionId}`, body);
  }
}

function normalize(session: LcuSession, pickable: number[], bannable: number[]): ChampSelectState {
  const local = session.localPlayerCellId;
  const actions = session.actions.flat().filter((a) => a.type === "pick" || a.type === "ban");
  const acting = new Set(actions.filter((a) => a.isInProgress && !a.completed).map((a) => a.actorCellId));
  const own = actions.filter((a) => a.actorCellId === local && !a.completed);

  const bans = { ally: new Set<number>(), enemy: new Set<number>() };
  for (const action of actions) {
    if (action.type === "ban" && action.completed && action.championId > 0) {
      bans[action.isAllyAction ? "ally" : "enemy"].add(action.championId);
    }
  }
  session.bans?.myTeamBans.forEach((id) => id > 0 && bans.ally.add(id));
  session.bans?.theirTeamBans.forEach((id) => id > 0 && bans.enemy.add(id));

  const picked = actions
    .filter((a) => a.type === "pick" && a.completed && a.championId > 0)
    .map((a) => a.championId);

  const lockedPick = actions.find(
    (a) => a.actorCellId === local && a.type === "pick" && a.completed && a.championId > 0,
  );

  return {
    phase: session.timer.phase,
    timeLeftMs: Math.max(0, session.timer.adjustedTimeLeftInPhase),
    totalTimeMs: session.timer.totalTimeInPhase,
    isInfinite: session.timer.isInfinite,
    localPlayerCellId: local,
    myTeam: session.myTeam.map((p) => toPlayer(p, local, acting)),
    theirTeam: session.theirTeam.map((p) => toPlayer(p, local, acting)),
    bans: { ally: [...bans.ally], enemy: [...bans.enemy] },
    currentAction: toAction(own.find((a) => a.isInProgress)),
    nextPickAction: toAction(own.find((a) => a.type === "pick")),
    lockedChampionId: lockedPick?.championId ?? 0,
    unavailable: [...new Set([...picked, ...bans.ally, ...bans.enemy])],
    pickable,
    bannable,
  };
}

function toPlayer(player: LcuPlayer, localCellId: number, acting: Set<number>): ChampSelectPlayer {
  return {
    cellId: player.cellId,
    championId: player.championId,
    pickIntentId: player.championPickIntent,
    position: player.assignedPosition,
    name: player.gameName || null,
    isLocalPlayer: player.cellId === localCellId,
    isActing: acting.has(player.cellId),
  };
}

function toAction(action: LcuAction | undefined): ChampSelectAction | null {
  if (!action) return null;
  return {
    id: action.id,
    type: action.type as "pick" | "ban",
    championId: action.championId,
    isInProgress: action.isInProgress,
  };
}

function availabilityKey(session: LcuSession): string {
  return session.actions
    .flat()
    .map((a) => `${a.id}:${a.completed ? a.championId : 0}:${a.isInProgress ? 1 : 0}`)
    .join(",");
}

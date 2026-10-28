import { LcuError } from "../lcu/client.js";
import type { LcuConnector } from "../lcu/connector.js";
import { debug } from "../log.js";
import { badRequest, HttpError } from "../server/errors.js";
import type { StateStore } from "../state.js";

export const CHAMP_SELECT_SESSION_URI = "/lol-champ-select/v1/session";
const PICKABLE_URI = "/lol-champ-select/v1/pickable-champion-ids";
const BANNABLE_URI = "/lol-champ-select/v1/bannable-champion-ids";
const MY_SELECTION_URI = "/lol-champ-select/v1/session/my-selection";
const GAMEFLOW_SESSION_URI = "/lol-gameflow/v1/session";

export interface ChampSelectPlayer {
  cellId: number;
  championId: number;
  pickIntentId: number;
  position: string;
  name: string | null;
  isLocalPlayer: boolean;
  /** True while this player has a pick or ban in progress. */
  isActing: boolean;
  spell1Id: number;
  spell2Id: number;
}

export interface ChampSelectAction {
  id: number;
  type: "pick" | "ban";
  championId: number;
  isInProgress: boolean;
}

export interface ChampSelectState {
  /** CLASSIC, ARAM... used to offer the right summoner spells. Null until known. */
  gameMode: string | null;
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
  spell1Id?: number;
  spell2Id?: number;
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
  private availabilityRequest = 0;
  private gameMode: string | null = null;

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

    assertChampionId(championId);
    await this.patchAction(action.id, { championId });
  }

  /** Locks in a pick or confirms a ban for the action in progress. */
  async lock(championId: number): Promise<void> {
    const session = this.requireSession();
    const action = session.currentAction;
    if (!action) throw new HttpError(409, "It is not your turn");

    assertChampionId(championId);
    await this.patchAction(action.id, { championId, completed: true });
  }

  /** Sets both summoner spells; the first one goes on D, the second on F. */
  async setSpells(spell1Id: number, spell2Id: number): Promise<void> {
    this.requireSession();
    if (![spell1Id, spell2Id].every((id) => Number.isInteger(id) && id > 0) || spell1Id === spell2Id) {
      throw badRequest("Choose two different summoner spells");
    }
    await this.lcu.client.patch(MY_SELECTION_URI, { spell1Id, spell2Id });
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
      this.gameMode = null;
      this.store.update({ champSelect: null });
      return;
    }

    if (!this.store.get().champSelect) void this.loadGameMode();

    const state = normalize(session, this.gameMode, this.pickable, this.bannable);
    this.store.update({ champSelect: state });

    // Pickable/bannable lists only change when an action completes, a turn starts or the phase changes.
    const key = availabilityKey(session);
    if (key !== this.availabilityKey) {
      this.availabilityKey = key;
      void this.refreshAvailability();
    }
  }

  private async refreshAvailability(): Promise<void> {
    const request = ++this.availabilityRequest;
    // Load both lists independently: one failing must not keep the other stale.
    const [pickable, bannable] = await Promise.all([
      this.fetchChampionIds(PICKABLE_URI),
      this.fetchChampionIds(BANNABLE_URI),
    ]);
    if (request !== this.availabilityRequest) return;

    if (pickable) this.pickable = pickable;
    if (bannable) this.bannable = bannable;
    debug(`champ-select: ${this.pickable.length} pickable, ${this.bannable.length} bannable`);

    const current = this.store.get().champSelect;
    if (current) {
      this.store.update({ champSelect: { ...current, pickable: this.pickable, bannable: this.bannable } });
    }
  }

  private async loadGameMode(): Promise<void> {
    try {
      const session = await this.lcu.client.get<{ gameData?: { queue?: { gameMode?: string } } }>(
        GAMEFLOW_SESSION_URI,
      );
      this.gameMode = session.gameData?.queue?.gameMode ?? null;
      const current = this.store.get().champSelect;
      if (current) this.store.update({ champSelect: { ...current, gameMode: this.gameMode } });
    } catch (error) {
      console.warn(`[champ-select] could not load the game mode: ${(error as Error).message}`);
    }
  }

  private async fetchChampionIds(uri: string): Promise<number[] | null> {
    try {
      const ids = await this.lcu.client.get<unknown>(uri);
      if (!Array.isArray(ids)) {
        console.warn(`[champ-select] unexpected response from ${uri}: ${JSON.stringify(ids)?.slice(0, 200)}`);
        return null;
      }
      return ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    } catch (error) {
      console.warn(`[champ-select] could not load ${uri}: ${(error as Error).message}`);
      return null;
    }
  }

  private requireSession(): ChampSelectState {
    const session = this.store.get().champSelect;
    if (!session) throw new HttpError(409, "Not in champion select");
    return session;
  }

  private async patchAction(actionId: number, body: { championId: number; completed?: boolean }) {
    await this.lcu.client.patch(`${CHAMP_SELECT_SESSION_URI}/actions/${actionId}`, body);
  }
}

/** Availability is enforced by the League client itself, which returns a clear error. */
function assertChampionId(championId: number): void {
  if (!Number.isInteger(championId) || championId <= 0) {
    throw badRequest("`championId` must be a positive integer");
  }
}

function normalize(
  session: LcuSession,
  gameMode: string | null,
  pickable: number[],
  bannable: number[],
): ChampSelectState {
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
    gameMode,
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
    spell1Id: player.spell1Id ?? 0,
    spell2Id: player.spell2Id ?? 0,
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
  return session.timer.phase + "|" + session.actions
    .flat()
    .map((a) => `${a.id}:${a.completed ? a.championId : 0}:${a.isInProgress ? 1 : 0}`)
    .join(",");
}

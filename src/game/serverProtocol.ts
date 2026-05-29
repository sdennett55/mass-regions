import type { RegionName } from "../data/massRegions";
import type {
  PlayerAction,
  PlayerState,
  SeasonState,
  TownBattleState,
  TownName,
  TownVisualState,
} from "./types";

export type ServerGameSnapshot = {
  capturedTownCount: number;
  contestedTownCount: number;
  controlCounts: Record<RegionName, number>;
  nextActionPointIn: number;
  player: PlayerState;
  revision: number;
  season: SeasonState;
  seasonLabel: string;
  seasonTimeRemaining: number;
  serverTime: number;
  townVisualStates: Record<string, TownVisualState>;
};

export type ServerActionRequest = {
  action: PlayerAction;
};

export type ServerWorldUpdateEvent = {
  type: "world-update";
  changedTowns: Array<{
    town: TownBattleState;
    townName: TownName;
  }>;
  capturedTownCount: number;
  contestedTownCount: number;
  controlCounts: Record<RegionName, number>;
  revision: number;
  serverTime: number;
};

export type ServerSeasonResetEvent = {
  type: "season-reset";
  capturedTownCount: number;
  contestedTownCount: number;
  controlCounts: Record<RegionName, number>;
  revision: number;
  season: SeasonState;
  seasonLabel: string;
  seasonTimeRemaining: number;
  serverTime: number;
};

export type ServerGameEvent = ServerWorldUpdateEvent | ServerSeasonResetEvent;

export type ServerActionResponse =
  | {
      ok: true;
      snapshot: ServerGameSnapshot;
    }
  | {
      error: string;
      ok: false;
      snapshot: ServerGameSnapshot;
    };

export type ServerStateResponse = {
  snapshot: ServerGameSnapshot;
};

export type ServerStatsSnapshot = {
  actions: {
    averageLatencyMs: number;
    lastMinute: number;
    rejected: number;
    sessionSyncErrors: number;
    successful: number;
    total: number;
  };
  memory: {
    heapUsedMb: number;
    rssMb: number;
  };
  requests: {
    stateLastMinute: number;
    stateTotal: number;
  };
  sse: {
    activeConnections: number;
    connectionAttemptsLastMinute: number;
    peakConnections: number;
    totalConnections: number;
  };
  uptimeSeconds: number;
};

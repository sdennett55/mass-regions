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
      sessionToken?: string;
      snapshot: ServerGameSnapshot;
    }
  | {
      error: string;
      ok: false;
      sessionToken?: string;
      snapshot: ServerGameSnapshot;
    };

export type ServerStateResponse = {
  sessionToken?: string;
  snapshot: ServerGameSnapshot;
};

export type ServerIpActivitySnapshot = {
  actionCountLastWindow: number;
  blockReason: string | null;
  blockedUntil: number | null;
  ip: string;
  isBlocked: boolean;
  newSessionsLastWindow: number;
};

export type ServerIpModerationSnapshot = {
  activeBlockedIps: number;
  hotIps: ServerIpActivitySnapshot[];
};

export type ServerIpTimeoutRequest = {
  durationMinutes?: number;
  ip: string;
};

export type ServerIpTimeoutResponse = {
  moderation: ServerIpModerationSnapshot;
  ok: true;
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
  moderation: ServerIpModerationSnapshot;
  uptimeSeconds: number;
};

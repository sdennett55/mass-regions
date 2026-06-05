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

export type ServerHumanVerificationState = {
  enabled: boolean;
  required: boolean;
  siteKey: string | null;
  verifiedUntil: number | null;
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
      humanVerification?: ServerHumanVerificationState;
      ok: true;
      sessionToken?: string;
      snapshot: ServerGameSnapshot;
    }
  | {
      error: string;
      humanVerification?: ServerHumanVerificationState;
      ok: false;
      sessionToken?: string;
      snapshot: ServerGameSnapshot;
    };

export type ServerStateResponse = {
  humanVerification: ServerHumanVerificationState;
  sessionToken?: string;
  snapshot: ServerGameSnapshot;
};

export type ServerIpActivitySnapshot = {
  actionCountLastWindow: number;
  blockReason: string | null;
  blockedUntil: number | null;
  ip: string;
  isBlocked: boolean;
  lastActivityAt: number | null;
  newSessionsLastWindow: number;
  rollbackSessionCount: number;
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

export type ServerIpCaptureRevertResponse = {
  moderation: ServerIpModerationSnapshot;
  ok: true;
  revertedCaptureCount: number;
};

export type ServerHumanVerificationRequest = {
  token: string;
};

export type ServerHumanVerificationResponse =
  | {
      humanVerification: ServerHumanVerificationState;
      ok: true;
      sessionToken?: string;
    }
  | {
      error: string;
      humanVerification: ServerHumanVerificationState;
      ok: false;
      sessionToken?: string;
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

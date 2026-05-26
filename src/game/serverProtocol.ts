import type { RegionName } from "../data/massRegions";
import type {
  PlayerAction,
  PlayerState,
  SeasonState,
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

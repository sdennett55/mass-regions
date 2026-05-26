import {
  buildTownVisualStates,
  createPlayerState,
  createSeasonState,
  getRegionControlCountsFromSeason,
  getSeasonTimeRemaining,
  getSeasonWindow,
  getTimeUntilNextActionPoint,
} from "./logic";
import { sharedTownNeighbors } from "./townNeighbors";
import type { PlayerAction } from "./types";
import type {
  ServerActionResponse,
  ServerGameSnapshot,
  ServerStateResponse,
} from "./serverProtocol";

const DEFAULT_DEV_SERVER_URL = "http://localhost:4000";

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function getGameServerBaseUrl() {
  const configuredUrl = import.meta.env.VITE_GAME_SERVER_URL?.trim();
  if (configuredUrl) {
    return trimTrailingSlashes(configuredUrl);
  }

  if (typeof window === "undefined") {
    return DEFAULT_DEV_SERVER_URL;
  }

  return import.meta.env.DEV ? DEFAULT_DEV_SERVER_URL : window.location.origin;
}

function buildGameServerUrl(
  path: string,
  searchParams?: Record<string, string>,
) {
  const baseUrl = `${getGameServerBaseUrl()}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(normalizedPath, baseUrl);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

async function parseJsonResponse<T>(response: Response) {
  const data = (await response.json()) as T | { error?: string };

  if (!response.ok) {
    const error =
      typeof (data as { error?: string }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${response.status}).`;
    throw new Error(error);
  }

  return data as T;
}

export async function fetchServerSnapshot(signal?: AbortSignal) {
  const response = await fetch(buildGameServerUrl("api/state").toString(), {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  const data = await parseJsonResponse<ServerStateResponse>(response);
  return data.snapshot;
}

export async function postServerAction(action: PlayerAction) {
  const response = await fetch(buildGameServerUrl("api/actions").toString(), {
    body: JSON.stringify({
      action,
    }),
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return parseJsonResponse<ServerActionResponse>(response);
}

export function openServerEvents() {
  return new EventSource(buildGameServerUrl("api/events").toString(), {
    withCredentials: true,
  });
}

export function createInitialServerSnapshot(now = Date.now()): ServerGameSnapshot {
  const season = createSeasonState(now);
  const seasonWindow = getSeasonWindow(now);
  const player = createPlayerState(now);

  return {
    capturedTownCount: 0,
    contestedTownCount: 0,
    controlCounts: getRegionControlCountsFromSeason(season),
    nextActionPointIn: getTimeUntilNextActionPoint(player, now),
    player,
    revision: 0,
    season,
    seasonLabel: `Season ${seasonWindow.seasonNumber}`,
    seasonTimeRemaining: getSeasonTimeRemaining(season, now),
    serverTime: now,
    townVisualStates: buildTownVisualStates(season, sharedTownNeighbors, now),
  };
}

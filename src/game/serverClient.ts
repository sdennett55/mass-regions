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
  ServerIpCaptureRevertResponse,
  ServerIpTimeoutResponse,
  ServerActionResponse,
  ServerGameSnapshot,
  ServerHumanVerificationResponse,
  ServerStatsSnapshot,
  ServerStateResponse,
} from "./serverProtocol";

const DEFAULT_DEV_SERVER_URL = "http://localhost:4000";
const REFILL_ACTION_POINTS_QUERY_PARAM = "refillActionPoints";
const LEGACY_REFILL_ACTION_POINTS_QUERY_PARAM = "refillInfluence";
const ADMIN_STATS_TOKEN_HEADER = "x-admin-token";
const SESSION_TOKEN_HEADER = "x-session-token";
const SESSION_TOKEN_QUERY_PARAM = "sessionToken";
const SESSION_TOKEN_STORAGE_KEY = "mass-regions:server-session-token";

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
  sessionTokenOverride?: string | null,
) {
  const baseUrl = `${getGameServerBaseUrl()}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(normalizedPath, baseUrl);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  if (sessionTokenOverride) {
    url.searchParams.set(SESSION_TOKEN_QUERY_PARAM, sessionTokenOverride);
  }

  return url;
}

function getStoredSessionToken() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistSessionToken(sessionToken: string | undefined) {
  if (!sessionToken || typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, sessionToken);
  } catch {
    // Ignore storage failures so the live session can still continue in-memory.
  }
}

function getDevStateRequestSearchParams() {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return undefined
  }

  try {
    const currentSearchParams = new URLSearchParams(window.location.search)
    const refillActionPointsParam =
      currentSearchParams.get(REFILL_ACTION_POINTS_QUERY_PARAM) ??
      currentSearchParams.get(LEGACY_REFILL_ACTION_POINTS_QUERY_PARAM)

    if (
      refillActionPointsParam === null ||
      refillActionPointsParam === "0" ||
      refillActionPointsParam.toLowerCase() === "false"
    ) {
      return undefined
    }

    return {
      refillActionPoints: refillActionPointsParam,
    }
  } catch {
    return undefined
  }
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

export async function fetchServerSnapshot(
  signal?: AbortSignal,
  sessionTokenOverride?: string | null,
) {
  const headers: HeadersInit = {
    Accept: "application/json",
  };
  const sessionToken = sessionTokenOverride ?? getStoredSessionToken();
  if (sessionToken) {
    headers[SESSION_TOKEN_HEADER] = sessionToken;
  }

  const response = await fetch(
    buildGameServerUrl("api/state", getDevStateRequestSearchParams()).toString(),
    {
    credentials: "include",
    headers,
    signal,
  },
  );

  const data = await parseJsonResponse<ServerStateResponse>(response);
  persistSessionToken(data.sessionToken);
  return data;
}

export async function postServerAction(
  action: PlayerAction,
  sessionTokenOverride?: string | null,
) {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  const sessionToken = sessionTokenOverride ?? getStoredSessionToken();
  if (sessionToken) {
    headers[SESSION_TOKEN_HEADER] = sessionToken;
  }

  const response = await fetch(
    buildGameServerUrl("api/actions").toString(),
    {
    body: JSON.stringify({
      action,
    }),
    credentials: "include",
    headers,
    method: "POST",
    },
  );

  const data = await parseJsonResponse<ServerActionResponse>(response);
  persistSessionToken(data.sessionToken);
  return data;
}

export async function postServerHumanVerification(
  token: string,
  sessionTokenOverride?: string | null,
) {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  const sessionToken = sessionTokenOverride ?? getStoredSessionToken();
  if (sessionToken) {
    headers[SESSION_TOKEN_HEADER] = sessionToken;
  }

  const response = await fetch(
    buildGameServerUrl("api/human-verification").toString(),
    {
      body: JSON.stringify({
        token,
      }),
      credentials: "include",
      headers,
      method: "POST",
    },
  );

  const data = await parseJsonResponse<ServerHumanVerificationResponse>(response);
  persistSessionToken(data.sessionToken);
  return data;
}

export function openServerEvents(sessionTokenOverride?: string | null) {
  const sessionToken = sessionTokenOverride ?? getStoredSessionToken();
  return new EventSource(
    buildGameServerUrl("api/events", undefined, sessionToken).toString(),
    {
    withCredentials: true,
    },
  );
}

export async function fetchServerStats(
  signal?: AbortSignal,
  adminStatsToken?: string | null,
) {
  const headers: HeadersInit = {
    Accept: "application/json",
  };

  if (adminStatsToken) {
    headers[ADMIN_STATS_TOKEN_HEADER] = adminStatsToken;
  }

  const response = await fetch(buildGameServerUrl("api/stats").toString(), {
    credentials: "include",
    headers,
    signal,
  });

  return parseJsonResponse<ServerStatsSnapshot>(response);
}

export async function createServerIpTimeout(
  ip: string,
  adminStatsToken: string,
  durationMinutes?: number,
) {
  const response = await fetch(buildGameServerUrl("api/admin/ip-timeouts").toString(), {
    body: JSON.stringify({
      durationMinutes,
      ip,
    }),
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      [ADMIN_STATS_TOKEN_HEADER]: adminStatsToken,
    },
    method: "POST",
  });

  return parseJsonResponse<ServerIpTimeoutResponse>(response);
}

export async function clearServerIpTimeout(
  ip: string,
  adminStatsToken: string,
) {
  const encodedIp = encodeURIComponent(ip);
  const response = await fetch(
    buildGameServerUrl(`api/admin/ip-timeouts/${encodedIp}`).toString(),
    {
      credentials: "include",
      headers: {
        [ADMIN_STATS_TOKEN_HEADER]: adminStatsToken,
      },
      method: "DELETE",
    },
  );

  return parseJsonResponse<ServerIpTimeoutResponse>(response);
}

export async function revertServerIpCaptures(
  ip: string,
  adminStatsToken: string,
) {
  const encodedIp = encodeURIComponent(ip);
  const response = await fetch(
    buildGameServerUrl(`api/admin/ip-timeouts/${encodedIp}/revert-captures`).toString(),
    {
      credentials: "include",
      headers: {
        [ADMIN_STATS_TOKEN_HEADER]: adminStatsToken,
      },
      method: "POST",
    },
  );

  return parseJsonResponse<ServerIpCaptureRevertResponse>(response);
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
    seasonLabel: `Week ${seasonWindow.seasonNumber}`,
    seasonTimeRemaining: getSeasonTimeRemaining(season, now),
    serverTime: now,
    townVisualStates: buildTownVisualStates(season, sharedTownNeighbors, now),
  };
}

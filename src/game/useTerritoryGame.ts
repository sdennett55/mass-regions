import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GAME_CLOCK_INTERVAL_MS } from "./constants";
import {
  buildRegionControlLegend,
  buildTownVisualStates,
  formatDurationShort,
  getNextTownVisualExpiryAt,
  getSeasonTimeRemaining,
  getTimeUntilNextActionPoint,
  getTownCaptureProtectionRemaining,
  getValidInvadingRegions,
  regeneratePlayerActionPoints,
} from "./logic";
import {
  createInitialServerSnapshot,
  fetchServerSnapshot,
  openServerEvents,
  postServerAction,
} from "./serverClient";
import { sharedTownNeighbors } from "./townNeighbors";
import type { ServerGameSnapshot } from "./serverProtocol";
import type { PlayerAction, RegionName, TownName } from "./types";

type ServerClockAnchor = {
  clientTime: number;
  serverTime: number;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function getApproxServerNow(anchor: ServerClockAnchor, clientNow: number) {
  return anchor.serverTime + (clientNow - anchor.clientTime);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useTerritoryGame() {
  const [clientNow, setClientNow] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<ServerGameSnapshot>(() =>
    createInitialServerSnapshot(Date.now()),
  );
  const [clockAnchor, setClockAnchor] = useState<ServerClockAnchor>(() => {
    const now = Date.now();
    return {
      clientTime: now,
      serverTime: now,
    };
  });
  const [captureVisualServerNow, setCaptureVisualServerNow] = useState(
    () => Date.now(),
  );
  const [spendFeedbackKey, setSpendFeedbackKey] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const actionInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const clockAnchorRef = useRef(clockAnchor);
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    clockAnchorRef.current = clockAnchor;
  }, [clockAnchor]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const applySnapshot = useCallback((nextSnapshot: ServerGameSnapshot) => {
    const receivedAt = Date.now();
    const nextClockAnchor = {
      clientTime: receivedAt,
      serverTime: nextSnapshot.serverTime,
    };

    clockAnchorRef.current = nextClockAnchor;
    snapshotRef.current = nextSnapshot;
    setClockAnchor(nextClockAnchor);
    setSnapshot(nextSnapshot);
    setCaptureVisualServerNow(nextSnapshot.serverTime);
    setClientNow(receivedAt);
  }, []);

  const refreshSnapshot = useCallback(
    async (options?: { signal?: AbortSignal; suppressError?: boolean }) => {
      if (refreshInFlightRef.current) {
        return;
      }

      refreshInFlightRef.current = true;

      try {
        const nextSnapshot = await fetchServerSnapshot(options?.signal);
        applySnapshot(nextSnapshot);
      } catch (error) {
        if (!isAbortError(error) && !options?.suppressError) {
          setStatusMessage(
            getErrorMessage(error, "Could not reach the live territory server."),
          );
        }
      } finally {
        refreshInFlightRef.current = false;
      }
    },
    [applySnapshot],
  );

  useEffect(() => {
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void refreshSnapshot({ signal: abortController.signal });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    const eventSource = openServerEvents();

    const handleSnapshot = (event: Event) => {
      try {
        const nextSnapshot = JSON.parse((event as MessageEvent<string>).data) as ServerGameSnapshot;
        applySnapshot(nextSnapshot);
      } catch {
        // Ignore malformed events so the stream can keep running.
      }
    };

    const handleHeartbeat = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          serverTime?: number;
        };

        if (typeof payload.serverTime !== "number") {
          return;
        }

        const receivedAt = Date.now();
        const nextClockAnchor = {
          clientTime: receivedAt,
          serverTime: payload.serverTime,
        };

        clockAnchorRef.current = nextClockAnchor;
        setClockAnchor(nextClockAnchor);
        setClientNow(receivedAt);
      } catch {
        // Ignore malformed heartbeats so the browser can keep auto-reconnecting.
      }
    };

    eventSource.addEventListener("snapshot", handleSnapshot);
    eventSource.addEventListener("heartbeat", handleHeartbeat);

    return () => {
      eventSource.removeEventListener("snapshot", handleSnapshot);
      eventSource.removeEventListener("heartbeat", handleHeartbeat);
      eventSource.close();
    };
  }, [applySnapshot]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const nextClientNow = Date.now();
      setClientNow(nextClientNow);

      const approxServerNow = getApproxServerNow(
        clockAnchorRef.current,
        nextClientNow,
      );

      if (approxServerNow >= snapshotRef.current.season.endsAt) {
        void refreshSnapshot({ suppressError: true });
      }
    }, GAME_CLOCK_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage(null);
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [statusMessage]);

  const serverNow = useMemo(
    () => getApproxServerNow(clockAnchor, clientNow),
    [clientNow, clockAnchor],
  );
  const resolvedPlayerState = useMemo(
    () => regeneratePlayerActionPoints(snapshot.player, serverNow),
    [serverNow, snapshot.player],
  );
  const seasonTimeRemaining = useMemo(
    () => getSeasonTimeRemaining(snapshot.season, serverNow),
    [serverNow, snapshot.season],
  );
  const nextActionPointIn = useMemo(
    () => getTimeUntilNextActionPoint(snapshot.player, serverNow),
    [serverNow, snapshot.player],
  );
  const legendGroups = useMemo(
    () => buildRegionControlLegend(snapshot.season),
    [snapshot.season],
  );
  const nextTownVisualExpiryAt = useMemo(
    () => getNextTownVisualExpiryAt(snapshot.season, serverNow),
    [serverNow, snapshot.season],
  );
  const townVisualStates = useMemo(
    () =>
      buildTownVisualStates(
        snapshot.season,
        sharedTownNeighbors,
        captureVisualServerNow,
      ),
    [captureVisualServerNow, snapshot.season],
  );
  const capturedTownCount = useMemo(
    () =>
      Object.values(townVisualStates).filter((town) => town.isCaptureProtected)
        .length,
    [townVisualStates],
  );

  useEffect(() => {
    if (nextTownVisualExpiryAt === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCaptureVisualServerNow(
        getApproxServerNow(clockAnchorRef.current, Date.now()),
      );
    }, Math.max(0, nextTownVisualExpiryAt - serverNow) + 16);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [nextTownVisualExpiryAt, serverNow]);

  const performAction = useCallback(
    async (action: PlayerAction) => {
      if (actionInFlightRef.current) {
        return;
      }

      actionInFlightRef.current = true;

      try {
        const result = await postServerAction(action);
        applySnapshot(result.snapshot);

        if (!result.ok) {
          setStatusMessage(
            result.error === "No action points available."
              ? `No action points. +1 in ${formatDurationShort(
                  getTimeUntilNextActionPoint(
                    result.snapshot.player,
                    result.snapshot.serverTime,
                  ),
                )}.`
              : result.error,
          );
          return;
        }

        setSpendFeedbackKey((currentKey) => (currentKey ?? 0) + 1);
        setStatusMessage(null);
      } catch (error) {
        setStatusMessage(
          getErrorMessage(error, "Could not send that action to the live map."),
        );
      } finally {
        actionInFlightRef.current = false;
      }
    },
    [applySnapshot],
  );

  const getTownBattleState = useCallback(
    (townName: TownName) => snapshot.season.towns[townName],
    [snapshot.season],
  );

  const getTownContext = useCallback(
    (townName: TownName) => {
      const town = getTownBattleState(townName);
      if (!town) {
        return null;
      }

      const captureProtectionRemaining = getTownCaptureProtectionRemaining(
        town,
        serverNow,
      );

      return {
        captureProtectionRemaining,
        isCaptureProtected: captureProtectionRemaining > 0,
        neighboringTowns: sharedTownNeighbors[townName] ?? [],
        town,
        validInvadingRegions: getValidInvadingRegions({
          season: snapshot.season,
          townName,
          townNeighbors: sharedTownNeighbors,
        }),
      };
    },
    [getTownBattleState, serverNow, snapshot.season],
  );

  return {
    actionPoints: resolvedPlayerState.actionPoints,
    capturedTownCount,
    contestedTownCount: snapshot.contestedTownCount,
    controlCounts: snapshot.controlCounts,
    getTownBattleState,
    getTownContext,
    legendGroups,
    nextActionPointIn,
    onDefend: (townName: TownName) =>
      performAction({ townName, type: "defend" }),
    onDismissSpendFeedback: () => setSpendFeedbackKey(null),
    onInvade: (townName: TownName, invadingRegion: RegionName) =>
      performAction({ invadingRegion, townName, type: "invade" }),
    season: snapshot.season,
    seasonLabel: snapshot.seasonLabel,
    seasonTimeRemaining,
    spendFeedbackKey,
    statusMessage,
    townVisualStates,
  };
}

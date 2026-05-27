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
import type {
  ActivityEvent,
  PlayerAction,
  RegionName,
  TownName,
} from "./types";

type ServerClockAnchor = {
  clientTime: number;
  serverTime: number;
};

const MAX_ACTIVITY_EVENTS = 12;
const ATTACK_SOUND_SRC = "/sounds/attack.mp3";
const CAPTURE_SOUND_SRC = "/sounds/capture.mp3";
const DEFEND_SOUND_SRC = "/sounds/defend.mp3";

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function getApproxServerNow(anchor: ServerClockAnchor, clientNow: number) {
  return anchor.serverTime + (clientNow - anchor.clientTime);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function createSound(src: string) {
  if (typeof Audio === "undefined") {
    return null;
  }

  const audio = new Audio(src);
  audio.preload = "auto";
  return audio;
}

function playSound(audio: HTMLAudioElement | null) {
  if (!audio) {
    return;
  }

  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Ignore blocked playback so actions can continue silently.
  });
}

function getActivityEvents(
  previousSnapshot: ServerGameSnapshot,
  nextSnapshot: ServerGameSnapshot,
) {
  if (previousSnapshot.revision === nextSnapshot.revision) {
    return [] as ActivityEvent[];
  }

  const events: ActivityEvent[] = [];

  for (const [townName, nextTown] of Object.entries(nextSnapshot.season.towns)) {
    const previousTown = previousSnapshot.season.towns[townName];

    if (
      !previousTown ||
      typeof nextTown.lastCapturedAt !== "number" ||
      nextTown.lastCapturedAt === previousTown.lastCapturedAt ||
      nextTown.currentRegion === previousTown.currentRegion
    ) {
      continue;
    }

    events.push({
      id: `${townName}:${nextTown.lastCapturedAt}`,
      kind: "capture",
      occurredAt: nextTown.lastCapturedAt,
      region: nextTown.currentRegion,
      townName,
    });
  }

  const territoryTotal = Object.keys(nextSnapshot.season.towns).length;

  for (const [region, nextControlCount] of Object.entries(nextSnapshot.controlCounts)) {
    const previousControlCount = previousSnapshot.controlCounts[region as RegionName] ?? 0;
    const crossedMajorityThreshold =
      previousControlCount / territoryTotal < 0.5 &&
      nextControlCount / territoryTotal >= 0.5;
    const reachedTotalControl =
      previousControlCount < territoryTotal && nextControlCount === territoryTotal;

    if (reachedTotalControl) {
      events.push({
        id: `total-control:${region}:${nextSnapshot.revision}`,
        kind: "total-control",
        occurredAt: nextSnapshot.serverTime,
        region: region as RegionName,
        territoryTotal,
      });
      continue;
    }

    if (crossedMajorityThreshold) {
      events.push({
        id: `majority-control:${region}:${nextSnapshot.revision}`,
        kind: "majority-control",
        occurredAt: nextSnapshot.serverTime,
        region: region as RegionName,
        territoryCount: nextControlCount,
        territoryTotal,
      });
    }
  }

  return events.sort((a, b) => b.occurredAt - a.occurredAt);
}

export function useTerritoryGame() {
  const [clientNow, setClientNow] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<ServerGameSnapshot>(() =>
    createInitialServerSnapshot(Date.now()),
  );
  const [hasLiveSnapshot, setHasLiveSnapshot] = useState(false);
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
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const actionInFlightRef = useRef(false);
  const attackAudioRef = useRef<HTMLAudioElement | null>(null);
  const captureAudioRef = useRef<HTMLAudioElement | null>(null);
  const defendAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasAppliedFirstServerSnapshotRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const clockAnchorRef = useRef(clockAnchor);
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    clockAnchorRef.current = clockAnchor;
  }, [clockAnchor]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    attackAudioRef.current = createSound(ATTACK_SOUND_SRC);
    captureAudioRef.current = createSound(CAPTURE_SOUND_SRC);
    defendAudioRef.current = createSound(DEFEND_SOUND_SRC);

    return () => {
      for (const audio of [
        attackAudioRef.current,
        captureAudioRef.current,
        defendAudioRef.current,
      ]) {
        if (!audio) {
          continue;
        }

        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, []);

  const applySnapshot = useCallback((nextSnapshot: ServerGameSnapshot) => {
    const previousSnapshot = snapshotRef.current;
    const receivedAt = Date.now();
    const nextClockAnchor = {
      clientTime: receivedAt,
      serverTime: nextSnapshot.serverTime,
    };

    if (hasAppliedFirstServerSnapshotRef.current) {
      const nextEvents = getActivityEvents(previousSnapshot, nextSnapshot);

      if (nextEvents.length > 0) {
        setActivityEvents((currentEvents) => {
          const seenEventIds = new Set(nextEvents.map((event) => event.id));
          const mergedEvents = [
            ...nextEvents,
            ...currentEvents.filter((event) => !seenEventIds.has(event.id)),
          ];

          return mergedEvents
            .sort((a, b) => b.occurredAt - a.occurredAt)
            .slice(0, MAX_ACTIVITY_EVENTS);
        });
      }
    } else {
      hasAppliedFirstServerSnapshotRef.current = true;
    }

    clockAnchorRef.current = nextClockAnchor;
    snapshotRef.current = nextSnapshot;
    setHasLiveSnapshot(true);
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
    if (!hasLiveSnapshot) {
      return;
    }

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
  }, [applySnapshot, hasLiveSnapshot]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshSnapshot({ suppressError: true });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshSnapshot]);

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
      const previousTown = snapshotRef.current.season.towns[action.townName];

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

        if (action.type === "invade") {
          const nextTown = result.snapshot.season.towns[action.townName];

          if (
            previousTown &&
            nextTown &&
            typeof nextTown.lastCapturedAt === "number" &&
            nextTown.lastCapturedAt !== previousTown.lastCapturedAt &&
            previousTown.currentRegion !== nextTown.currentRegion &&
            nextTown.currentRegion === action.invadingRegion
          ) {
            playSound(captureAudioRef.current);
          }
        }

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
    activityEvents,
    capturedTownCount,
    contestedTownCount: snapshot.contestedTownCount,
    controlCounts: snapshot.controlCounts,
    getTownBattleState,
    getTownContext,
    hasLiveSnapshot,
    legendGroups,
    nextActionPointIn,
    onDefend: (townName: TownName) => {
      playSound(defendAudioRef.current);
      return performAction({ townName, type: "defend" });
    },
    onInvade: (townName: TownName, invadingRegion: RegionName) => {
      playSound(attackAudioRef.current);
      return performAction({ invadingRegion, townName, type: "invade" });
    },
    season: snapshot.season,
    seasonLabel: snapshot.seasonLabel,
    serverNow,
    seasonTimeRemaining,
    statusMessage,
    townVisualStates,
  };
}

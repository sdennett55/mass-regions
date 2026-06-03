import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GAME_CLOCK_INTERVAL_MS } from "./constants";
import {
  buildRegionControlLegend,
  buildTownVisualStates,
  formatDurationShort,
  getPlayerActionPointRegenIntervalMs,
  getPlayerMaxActionPoints,
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
import type { ServerGameEvent, ServerGameSnapshot } from "./serverProtocol";
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
const SILENT_AUDIO_SAMPLE_RATE = 8_000;
const SILENT_AUDIO_SAMPLE_COUNT = SILENT_AUDIO_SAMPLE_RATE / 20;
type BrowserAudioContext = AudioContext;
type BrowserAudioElement = HTMLAudioElement;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function getApproxServerNow(anchor: ServerClockAnchor, clientNow: number) {
  return anchor.serverTime + (clientNow - anchor.clientTime);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isSnapshotStale(
  currentSnapshot: ServerGameSnapshot,
  nextSnapshot: ServerGameSnapshot,
) {
  if (nextSnapshot.revision < currentSnapshot.revision) {
    return true;
  }

  if (
    nextSnapshot.revision === currentSnapshot.revision &&
    nextSnapshot.serverTime < currentSnapshot.serverTime
  ) {
    return true;
  }

  return false;
}

function createAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextClass =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  return new AudioContextClass();
}

function createAudioElement(src: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const audio = new Audio(src);
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  return audio;
}

function createSilentKickAudioElement() {
  if (typeof window === "undefined") {
    return null;
  }

  const byteLength = 44 + SILENT_AUDIO_SAMPLE_COUNT * 2;
  const wavBuffer = new ArrayBuffer(byteLength);
  const view = new DataView(wavBuffer);

  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, byteLength - 8, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SILENT_AUDIO_SAMPLE_RATE, true);
  view.setUint32(28, SILENT_AUDIO_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, SILENT_AUDIO_SAMPLE_COUNT * 2, true);

  const objectUrl = URL.createObjectURL(
    new Blob([wavBuffer], { type: "audio/wav" }),
  );
  const audio = new Audio(objectUrl);
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  return audio;
}

async function loadEncodedAudio(src: string, signal?: AbortSignal) {
  const response = await fetch(src, {
    cache: "force-cache",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Could not load sound: ${src}`);
  }

  return response.arrayBuffer();
}

function decodeLoadedAudioBuffer(
  audioContext: BrowserAudioContext,
  encodedAudio: ArrayBuffer,
) {
  return audioContext.decodeAudioData(encodedAudio.slice(0));
}

function playBufferedSound(
  audioContext: BrowserAudioContext | null,
  audioBuffer: AudioBuffer | null,
  onFallback?: () => void,
) {
  if (!audioContext || !audioBuffer) {
    onFallback?.();
    return;
  }

  const startPlayback = () => {
    try {
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(0);
      return true;
    } catch {
      return false;
    }
  };

  if (audioContext.state === "running") {
    if (!startPlayback()) {
      onFallback?.();
    }
    return;
  }

  void audioContext
    .resume()
    .then(() => {
      if (audioContext.state === "running" && startPlayback()) {
        return;
      }

      onFallback?.();
    })
    .catch(() => {
      onFallback?.();
    });
}

function playElementSound(audioElement: BrowserAudioElement | null) {
  if (!audioElement) {
    return;
  }

  try {
    audioElement.currentTime = 0;
    void audioElement.play().catch(() => {
      // Ignore blocked playback so actions can continue silently.
    });
  } catch {
    // Ignore playback failures so actions can continue silently.
  }
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
  const [sessionToken, setSessionToken] = useState<string | null>(null);
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
  const [isActionPending, setIsActionPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const actionInFlightRef = useRef(false);
  const audioContextRef = useRef<BrowserAudioContext | null>(null);
  const attackAudioBufferRef = useRef<AudioBuffer | null>(null);
  const captureAudioBufferRef = useRef<AudioBuffer | null>(null);
  const defendAudioBufferRef = useRef<AudioBuffer | null>(null);
  const attackEncodedAudioRef = useRef<ArrayBuffer | null>(null);
  const captureEncodedAudioRef = useRef<ArrayBuffer | null>(null);
  const defendEncodedAudioRef = useRef<ArrayBuffer | null>(null);
  const attackAudioElementRef = useRef<BrowserAudioElement | null>(null);
  const captureAudioElementRef = useRef<BrowserAudioElement | null>(null);
  const defendAudioElementRef = useRef<BrowserAudioElement | null>(null);
  const silentKickAudioElementRef = useRef<BrowserAudioElement | null>(null);
  const hasAppliedFirstServerSnapshotRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const clockAnchorRef = useRef(clockAnchor);
  const snapshotRef = useRef(snapshot);
  const sessionTokenRef = useRef<string | null>(sessionToken);
  const audioDecodePromiseRef = useRef<Promise<void> | null>(null);
  const audioRecoveryPromiseRef = useRef<Promise<boolean> | null>(null);
  const audioNeedsForegroundRecoveryRef = useRef(false);

  useEffect(() => {
    clockAnchorRef.current = clockAnchor;
  }, [clockAnchor]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    sessionTokenRef.current = sessionToken;
  }, [sessionToken]);

  const clearDecodedAudioBuffers = useCallback(() => {
    attackAudioBufferRef.current = null;
    captureAudioBufferRef.current = null;
    defendAudioBufferRef.current = null;
    audioDecodePromiseRef.current = null;
  }, []);

  const invalidateAudioContext = useCallback(
    (closeExisting = false) => {
      const audioContext = audioContextRef.current;
      audioContextRef.current = null;
      clearDecodedAudioBuffers();

      if (closeExisting && audioContext) {
        void audioContext.close().catch(() => {
          // Ignore close failures while discarding a stale context.
        });
      }
    },
    [clearDecodedAudioBuffers],
  );

  const resumeAudioContext = useCallback(async () => {
    const audioContext = audioContextRef.current;
    if (!audioContext) {
      return false;
    }

    if (audioContext.state === "running") {
      return true;
    }

    if (audioContext.state === "closed") {
      invalidateAudioContext();
      return false;
    }

    try {
      await audioContext.resume();
    } catch {
      // Ignore resume failures so interaction can continue silently.
    }

    const resumedState = audioContextRef.current?.state;
    if (resumedState === "closed") {
      invalidateAudioContext();
      return false;
    }

    return resumedState === "running";
  }, [invalidateAudioContext]);

  const kickAudioSession = useCallback(async () => {
    const silentKickAudio = silentKickAudioElementRef.current;
    if (!silentKickAudio) {
      return;
    }

    try {
      silentKickAudio.currentTime = 0;
      await silentKickAudio.play();
      silentKickAudio.pause();
      silentKickAudio.currentTime = 0;
    } catch {
      // Ignore kick failures so the main audio path can still try Web Audio.
    }
  }, []);

  const decodeReadyAudioBuffers = useCallback(
    async (audioContext: BrowserAudioContext) => {
      if (audioDecodePromiseRef.current) {
        await audioDecodePromiseRef.current;
        return;
      }

      audioDecodePromiseRef.current = (async () => {
        if (!attackAudioBufferRef.current && attackEncodedAudioRef.current) {
          try {
            attackAudioBufferRef.current = await decodeLoadedAudioBuffer(
              audioContext,
              attackEncodedAudioRef.current,
            );
          } catch {
            attackAudioBufferRef.current = null;
          }
        }

        if (!captureAudioBufferRef.current && captureEncodedAudioRef.current) {
          try {
            captureAudioBufferRef.current = await decodeLoadedAudioBuffer(
              audioContext,
              captureEncodedAudioRef.current,
            );
          } catch {
            captureAudioBufferRef.current = null;
          }
        }

        if (!defendAudioBufferRef.current && defendEncodedAudioRef.current) {
          try {
            defendAudioBufferRef.current = await decodeLoadedAudioBuffer(
              audioContext,
              defendEncodedAudioRef.current,
            );
          } catch {
            defendAudioBufferRef.current = null;
          }
        }
      })().finally(() => {
        audioDecodePromiseRef.current = null;
      });

      await audioDecodePromiseRef.current;
    },
    [],
  );

  const initializeAudio = useCallback(async () => {
    let audioContext = audioContextRef.current;
    if (audioContext?.state === "closed") {
      invalidateAudioContext();
      audioContext = null;
    }

    if (!audioContext) {
      audioContext = createAudioContext();
      audioContextRef.current = audioContext;
    }

    if (!audioContext) {
      return false;
    }

    await Promise.allSettled([resumeAudioContext(), kickAudioSession()]);
    const isRunning = await resumeAudioContext();
    const resolvedAudioContext = audioContextRef.current;

    if (!resolvedAudioContext || !isRunning) {
      return false;
    }

    void decodeReadyAudioBuffers(resolvedAudioContext);
    return true;
  }, [
    decodeReadyAudioBuffers,
    invalidateAudioContext,
    kickAudioSession,
    resumeAudioContext,
  ]);

  const recoverAudioAfterForeground = useCallback(() => {
    if (!audioContextRef.current) {
      audioNeedsForegroundRecoveryRef.current = false;
      return null;
    }

    if (audioRecoveryPromiseRef.current) {
      return audioRecoveryPromiseRef.current;
    }

    const recoveryPromise = initializeAudio()
      .then((didRecover) => {
        if (!didRecover) {
          invalidateAudioContext(true);
        }

        return didRecover;
      })
      .finally(() => {
        audioNeedsForegroundRecoveryRef.current = false;
        audioRecoveryPromiseRef.current = null;
      });

    audioRecoveryPromiseRef.current = recoveryPromise;
    return recoveryPromise;
  }, [initializeAudio, invalidateAudioContext]);

  useEffect(() => {
    attackAudioElementRef.current = createAudioElement(ATTACK_SOUND_SRC);
    captureAudioElementRef.current = createAudioElement(CAPTURE_SOUND_SRC);
    defendAudioElementRef.current = createAudioElement(DEFEND_SOUND_SRC);
    silentKickAudioElementRef.current = createSilentKickAudioElement();

    attackAudioElementRef.current?.load();
    captureAudioElementRef.current?.load();
    defendAudioElementRef.current?.load();
    silentKickAudioElementRef.current?.load();

    const abortController = new AbortController();
    const warmAudioOnInteraction = () => {
      void initializeAudio();
    };

    window.addEventListener("pointerdown", warmAudioOnInteraction, {
      passive: true,
    });
    window.addEventListener("touchstart", warmAudioOnInteraction, {
      passive: true,
    });
    window.addEventListener("keydown", warmAudioOnInteraction);

    void loadEncodedAudio(ATTACK_SOUND_SRC, abortController.signal)
      .then((encodedAudio) => {
        attackEncodedAudioRef.current = encodedAudio;
      })
      .catch(() => {
        attackEncodedAudioRef.current = null;
      });

    void loadEncodedAudio(CAPTURE_SOUND_SRC, abortController.signal)
      .then((encodedAudio) => {
        captureEncodedAudioRef.current = encodedAudio;
      })
      .catch(() => {
        captureEncodedAudioRef.current = null;
      });

    void loadEncodedAudio(DEFEND_SOUND_SRC, abortController.signal)
      .then((encodedAudio) => {
        defendEncodedAudioRef.current = encodedAudio;
      })
      .catch(() => {
        defendEncodedAudioRef.current = null;
      });

    return () => {
      const audioContext = audioContextRef.current;

      abortController.abort();
      window.removeEventListener("pointerdown", warmAudioOnInteraction);
      window.removeEventListener("touchstart", warmAudioOnInteraction);
      window.removeEventListener("keydown", warmAudioOnInteraction);
      clearDecodedAudioBuffers();
      audioRecoveryPromiseRef.current = null;
      audioNeedsForegroundRecoveryRef.current = false;
      attackEncodedAudioRef.current = null;
      captureEncodedAudioRef.current = null;
      defendEncodedAudioRef.current = null;
      audioContextRef.current = null;
      attackAudioElementRef.current = null;
      captureAudioElementRef.current = null;
      defendAudioElementRef.current = null;

      if (silentKickAudioElementRef.current?.src.startsWith("blob:")) {
        URL.revokeObjectURL(silentKickAudioElementRef.current.src);
      }

      silentKickAudioElementRef.current = null;

      if (audioContext) {
        void audioContext.close().catch(() => {
          // Ignore close failures during teardown.
        });
      }
    };
  }, [clearDecodedAudioBuffers, initializeAudio]);

  const playSound = useCallback(
    (
      audioBuffer: AudioBuffer | null,
      audioElement: BrowserAudioElement | null,
    ) => {
      if (audioBuffer && audioContextRef.current) {
        playBufferedSound(audioContextRef.current, audioBuffer, () => {
          playElementSound(audioElement);
        });
        return;
      }

      playElementSound(audioElement);
    },
    [],
  );

  const applySnapshot = useCallback((nextSnapshot: ServerGameSnapshot) => {
    const previousSnapshot = snapshotRef.current;

    if (isSnapshotStale(previousSnapshot, nextSnapshot)) {
      return;
    }

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

  const applyWorldEvent = useCallback((event: ServerGameEvent) => {
    const currentSnapshot = snapshotRef.current;

    if (event.revision < currentSnapshot.revision) {
      return;
    }

    if (event.type === "season-reset") {
      applySnapshot({
        ...currentSnapshot,
        capturedTownCount: event.capturedTownCount,
        contestedTownCount: event.contestedTownCount,
        controlCounts: event.controlCounts,
        revision: event.revision,
        season: event.season,
        seasonLabel: event.seasonLabel,
        seasonTimeRemaining: event.seasonTimeRemaining,
        serverTime: event.serverTime,
        townVisualStates: currentSnapshot.townVisualStates,
      });
      return;
    }

    const nextSeason = {
      ...currentSnapshot.season,
      towns: {
        ...currentSnapshot.season.towns,
      },
    };

    for (const changedTown of event.changedTowns) {
      nextSeason.towns[changedTown.townName] = changedTown.town;
    }

    applySnapshot({
      ...currentSnapshot,
      capturedTownCount: event.capturedTownCount,
      contestedTownCount: event.contestedTownCount,
      controlCounts: event.controlCounts,
      nextActionPointIn: getTimeUntilNextActionPoint(
        currentSnapshot.player,
        event.serverTime,
      ),
      revision: event.revision,
      season: nextSeason,
      seasonTimeRemaining: getSeasonTimeRemaining(nextSeason, event.serverTime),
      serverTime: event.serverTime,
      townVisualStates: currentSnapshot.townVisualStates,
    });
  }, [applySnapshot]);

  const refreshSnapshot = useCallback(
    async (options?: { signal?: AbortSignal; suppressError?: boolean }) => {
      if (refreshInFlightRef.current) {
        return;
      }

      refreshInFlightRef.current = true;

      try {
        const { sessionToken: nextSessionToken, snapshot: nextSnapshot } = await fetchServerSnapshot(
          options?.signal,
          sessionTokenRef.current,
        );
        setSessionToken(nextSessionToken ?? null);
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
    if (!hasLiveSnapshot || !sessionToken) {
      return;
    }

    const eventSource = openServerEvents(sessionToken);

    const handleSnapshot = (event: Event) => {
      try {
        const nextSnapshot = JSON.parse((event as MessageEvent<string>).data) as ServerGameSnapshot;
        applySnapshot(nextSnapshot);
      } catch {
        // Ignore malformed events so the stream can keep running.
      }
    };

    const handleWorldEvent = (event: Event) => {
      try {
        const nextEvent = JSON.parse(
          (event as MessageEvent<string>).data,
        ) as ServerGameEvent;
        applyWorldEvent(nextEvent);
      } catch {
        // Ignore malformed world events so the stream can keep running.
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

    const handleError = () => {
      void refreshSnapshot({ suppressError: true });
    };

    eventSource.addEventListener("snapshot", handleSnapshot);
    eventSource.addEventListener("world-update", handleWorldEvent);
    eventSource.addEventListener("season-reset", handleWorldEvent);
    eventSource.addEventListener("heartbeat", handleHeartbeat);
    eventSource.addEventListener("error", handleError);

    return () => {
      eventSource.removeEventListener("snapshot", handleSnapshot);
      eventSource.removeEventListener("world-update", handleWorldEvent);
      eventSource.removeEventListener("season-reset", handleWorldEvent);
      eventSource.removeEventListener("heartbeat", handleHeartbeat);
      eventSource.removeEventListener("error", handleError);
      eventSource.close();
    };
  }, [applySnapshot, applyWorldEvent, hasLiveSnapshot, refreshSnapshot, sessionToken]);

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
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        audioNeedsForegroundRecoveryRef.current = Boolean(audioContextRef.current);
        return;
      }

      if (!audioNeedsForegroundRecoveryRef.current) {
        return;
      }

      void recoverAudioAfterForeground();
    };

    const handlePageShow = () => {
      if (!audioNeedsForegroundRecoveryRef.current) {
        return;
      }

      void recoverAudioAfterForeground();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [recoverAudioAfterForeground]);

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
  const maxActionPoints = useMemo(
    () => getPlayerMaxActionPoints(resolvedPlayerState),
    [resolvedPlayerState],
  );
  const actionPointRegenIntervalMs = useMemo(
    () => getPlayerActionPointRegenIntervalMs(resolvedPlayerState),
    [resolvedPlayerState],
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
      setIsActionPending(true);
      const previousTown = snapshotRef.current.season.towns[action.townName];

      if (audioNeedsForegroundRecoveryRef.current) {
        await (audioRecoveryPromiseRef.current ?? recoverAudioAfterForeground());
      } else {
        void initializeAudio();
      }

      if (action.type === "defend") {
        playSound(defendAudioBufferRef.current, defendAudioElementRef.current);
      } else {
        playSound(attackAudioBufferRef.current, attackAudioElementRef.current);
      }

      try {
        const result = await postServerAction(action, sessionTokenRef.current);
        if (result.sessionToken) {
          setSessionToken(result.sessionToken);
        }
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
            playSound(
              captureAudioBufferRef.current,
              captureAudioElementRef.current,
            );
          }
        }

        setStatusMessage(null);
      } catch (error) {
        setStatusMessage(
          getErrorMessage(error, "Could not send that action to the live map."),
        );
      } finally {
        actionInFlightRef.current = false;
        setIsActionPending(false);
      }
    },
    [applySnapshot, initializeAudio, playSound, recoverAudioAfterForeground],
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
    actionPointRegenIntervalMs,
    actionPoints: resolvedPlayerState.actionPoints,
    activityEvents,
    capturedTownCount,
    contestedTownCount: snapshot.contestedTownCount,
    controlCounts: snapshot.controlCounts,
    getTownBattleState,
    getTownContext,
    hasLiveSnapshot,
    isActionPending,
    legendGroups,
    maxActionPoints,
    nextActionPointIn,
    onDefend: (townName: TownName) => {
      return performAction({ townName, type: "defend" });
    },
    onInvade: (townName: TownName, invadingRegion: RegionName) => {
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

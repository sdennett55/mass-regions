import {
  applyAction,
  buildTownVisualStates,
  createPlayerState,
  ensureActiveSeasonState,
  getRegionControlCountsFromSeason,
  getSeasonTimeRemaining,
  getSeasonWindow,
  getTimeUntilNextActionPoint,
  normalizePlayerState,
  regeneratePlayerActionPoints,
  spendPlayerActionPoints,
} from "../../src/game/logic.ts"
import { sharedTownNeighbors } from "../../src/game/townNeighbors.ts"
import type {
  PlayerAction,
  PlayerProfile,
  PlayerState,
  SeasonState,
  TownBattleState,
  TownNeighbors,
} from "../../src/game/types.ts"

import type {
  ServerActionResponse,
  ServerGameEvent,
  ServerGameSnapshot,
  ServerSeasonResetEvent,
  ServerWorldUpdateEvent,
} from "./protocol.ts"
import type { CaptureHistoryRecord, ServerPersistence } from "./persistence.ts"

type StoreListener = (event: ServerGameEvent) => void

function arePlayerStatesEqual(
  left: PlayerState | null | undefined,
  right: PlayerState,
) {
  return (
    !!left &&
    left.actionPoints === right.actionPoints &&
    left.lastRegeneratedAt === right.lastRegeneratedAt &&
    left.maxActionPoints === right.maxActionPoints &&
    left.actionPointRegenIntervalMs === right.actionPointRegenIntervalMs
  )
}

function buildRevertedTownState(
  town: TownBattleState,
  record: CaptureHistoryRecord,
): TownBattleState {
  return {
    ...town,
    captureProgress: 0,
    contestingRegion: null,
    currentRegion: record.previousRegion,
    isContested: false,
    lastCapturedAt: record.previousLastCapturedAt ?? undefined,
  }
}

export class TerritoryGameStore {
  private listeners = new Set<StoreListener>()
  private readonly persistence: ServerPersistence
  private playerStates = new Map<string, PlayerState>()
  private revision = 0
  private seasonState: SeasonState
  private readonly townNeighbors: TownNeighbors

  constructor(persistence: ServerPersistence) {
    this.persistence = persistence
    this.townNeighbors = sharedTownNeighbors
    this.revision = this.persistence.loadRevision()

    const now = Date.now()
    const storedSeasonState = this.persistence.loadSeasonState()
    this.seasonState = ensureActiveSeasonState(storedSeasonState, now)

    if (this.seasonState !== storedSeasonState) {
      this.persistence.saveSeasonState(this.seasonState)
      this.persistence.saveRevision(this.revision)
    }
  }

  private getContestedTownCount(season: SeasonState) {
    return Object.values(season.towns).filter((town) => town.isContested).length
  }

  private getCapturedTownCountForSeason(season: SeasonState, now: number) {
    const townVisualStates = buildTownVisualStates(season, this.townNeighbors, now)
    return Object.values(townVisualStates).filter(
      (townVisualState) => townVisualState.isCaptureProtected,
    ).length
  }

  private emitChange(event: ServerGameEvent) {
    this.revision += 1
    this.persistence.saveSeasonState(this.seasonState)
    this.persistence.saveRevision(this.revision)
    for (const listener of this.listeners) {
      listener({
        ...event,
        revision: this.revision,
      })
    }
  }

  private ensureSeason(now: number) {
    const nextSeasonState = ensureActiveSeasonState(this.seasonState, now)
    if (nextSeasonState !== this.seasonState) {
      this.seasonState = nextSeasonState
      const seasonWindow = getSeasonWindow(now)
      const seasonResetEvent: ServerSeasonResetEvent = {
        type: "season-reset",
        capturedTownCount: this.getCapturedTownCountForSeason(this.seasonState, now),
        contestedTownCount: this.getContestedTownCount(this.seasonState),
        controlCounts: getRegionControlCountsFromSeason(this.seasonState),
        revision: this.revision,
        season: this.seasonState,
        seasonLabel: `Week ${seasonWindow.seasonNumber}`,
        seasonTimeRemaining: getSeasonTimeRemaining(this.seasonState, now),
        serverTime: now,
      }
      this.emitChange(seasonResetEvent)
    }
  }

  private ensurePlayer(
    playerId: string,
    now: number,
    profile?: Partial<PlayerProfile> | null,
  ) {
    const existingPlayer =
      this.playerStates.get(playerId) ?? this.persistence.loadPlayerState(playerId)
    if (!existingPlayer) {
      const nextPlayer = createPlayerState(now, profile)
      this.playerStates.set(playerId, nextPlayer)
      this.persistence.savePlayerState(playerId, nextPlayer)
      return nextPlayer
    }

    const normalizedPlayer = normalizePlayerState(existingPlayer, now, profile)
    const refreshedPlayer = regeneratePlayerActionPoints(normalizedPlayer, now)
    if (!arePlayerStatesEqual(existingPlayer, refreshedPlayer)) {
      this.playerStates.set(playerId, refreshedPlayer)
      this.persistence.savePlayerState(playerId, refreshedPlayer)
    }

    return refreshedPlayer
  }

  refillPlayerActionPoints(
    playerId: string,
    now = Date.now(),
    profile?: Partial<PlayerProfile> | null,
  ) {
    this.ensureSeason(now)
    const nextPlayer = createPlayerState(now, profile)
    this.playerStates.set(playerId, nextPlayer)
    this.persistence.savePlayerState(playerId, nextPlayer)
    return this.getSnapshot(playerId, now, profile)
  }

  private getCapturedTownCount(snapshot: ServerGameSnapshot) {
    return Object.values(snapshot.townVisualStates).filter(
      (townVisualState) => townVisualState.isCaptureProtected,
    ).length
  }

  getSnapshot(
    playerId: string,
    now = Date.now(),
    profile?: Partial<PlayerProfile> | null,
  ): ServerGameSnapshot {
    this.ensureSeason(now)
    const player = this.ensurePlayer(playerId, now, profile)
    const townVisualStates = buildTownVisualStates(
      this.seasonState,
      this.townNeighbors,
      now,
    )
    const seasonWindow = getSeasonWindow(now)

    const snapshot: ServerGameSnapshot = {
      contestedTownCount: this.getContestedTownCount(this.seasonState),
      controlCounts: getRegionControlCountsFromSeason(this.seasonState),
      nextActionPointIn: getTimeUntilNextActionPoint(player, now),
      player,
      revision: this.revision,
      season: this.seasonState,
      seasonLabel: `Week ${seasonWindow.seasonNumber}`,
      seasonTimeRemaining: getSeasonTimeRemaining(this.seasonState, now),
      serverTime: now,
      townVisualStates,
      capturedTownCount: 0,
    }

    snapshot.capturedTownCount = this.getCapturedTownCount(snapshot)
    return snapshot
  }

  revertCapturesForSessions(sessionIds: string[], now = Date.now()) {
    this.ensureSeason(now)
    const captureRecords = this.persistence.loadUnrevertedCapturesForSessions(
      sessionIds,
      this.seasonState.seasonId,
    )

    if (!captureRecords.length) {
      return 0
    }

    const nextTowns = {
      ...this.seasonState.towns,
    }
    const changedTowns: ServerWorldUpdateEvent["changedTowns"] = []
    const revertedCaptureIds: number[] = []

    for (const captureRecord of captureRecords) {
      const currentTown = nextTowns[captureRecord.townName]
      if (
        !currentTown ||
        currentTown.isContested ||
        currentTown.currentRegion !== captureRecord.newRegion ||
        currentTown.lastCapturedAt !== captureRecord.capturedAt
      ) {
        continue
      }

      const revertedTown = buildRevertedTownState(currentTown, captureRecord)
      nextTowns[captureRecord.townName] = revertedTown
      changedTowns.push({
        town: revertedTown,
        townName: captureRecord.townName,
      })
      revertedCaptureIds.push(captureRecord.id)
    }

    if (!revertedCaptureIds.length) {
      return 0
    }

    this.persistence.markCapturesReverted(revertedCaptureIds, now)
    this.seasonState = {
      ...this.seasonState,
      towns: nextTowns,
    }

    const worldUpdateEvent: ServerWorldUpdateEvent = {
      type: "world-update",
      changedTowns,
      capturedTownCount: this.getCapturedTownCountForSeason(this.seasonState, now),
      contestedTownCount: this.getContestedTownCount(this.seasonState),
      controlCounts: getRegionControlCountsFromSeason(this.seasonState),
      revision: this.revision,
      serverTime: now,
    }
    this.emitChange(worldUpdateEvent)

    return revertedCaptureIds.length
  }

  applyPlayerAction(
    playerId: string,
    action: PlayerAction,
    now = Date.now(),
    profile?: Partial<PlayerProfile> | null,
    actorIp?: string | null,
  ): ServerActionResponse {
    this.ensureSeason(now)
    const player = this.ensurePlayer(playerId, now, profile)
    const nextPlayerState = spendPlayerActionPoints(player, now)

    if (!nextPlayerState) {
      return {
        error: "No action points available.",
        ok: false,
        snapshot: this.getSnapshot(playerId, now, profile),
      }
    }

    const actionResult = applyAction({
      action,
      now,
      season: this.seasonState,
      townNeighbors: this.townNeighbors,
    })

    if (!actionResult.ok) {
      return {
        error: actionResult.error ?? "Action unavailable.",
        ok: false,
        snapshot: this.getSnapshot(playerId, now, profile),
      }
    }

    this.playerStates.set(playerId, nextPlayerState)
    this.persistence.savePlayerState(playerId, nextPlayerState)
    const previousTown = this.seasonState.towns[action.townName]
    this.seasonState = actionResult.season

    if (
      action.type === "invade" &&
      actorIp &&
      previousTown &&
      actionResult.town &&
      typeof actionResult.town.lastCapturedAt === "number" &&
      actionResult.town.lastCapturedAt === now &&
      previousTown.currentRegion !== actionResult.town.currentRegion
    ) {
      this.persistence.recordCapture({
        capturedAt: actionResult.town.lastCapturedAt,
        ip: actorIp,
        newRegion: actionResult.town.currentRegion,
        previousLastCapturedAt: previousTown.lastCapturedAt ?? null,
        previousRegion: previousTown.currentRegion,
        seasonId: this.seasonState.seasonId,
        sessionId: playerId,
        townName: action.townName,
      })
    }

    const worldUpdateEvent: ServerWorldUpdateEvent = {
      type: "world-update",
      changedTowns: actionResult.town
        ? [
            {
              town: actionResult.town,
              townName: action.townName,
            },
          ]
        : [],
      capturedTownCount: this.getCapturedTownCountForSeason(this.seasonState, now),
      contestedTownCount: this.getContestedTownCount(this.seasonState),
      controlCounts: getRegionControlCountsFromSeason(this.seasonState),
      revision: this.revision,
      serverTime: now,
    }
    this.emitChange(worldUpdateEvent)

    return {
      ok: true,
      snapshot: this.getSnapshot(playerId, now, profile),
    }
  }

  subscribe(listener: StoreListener) {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }
}

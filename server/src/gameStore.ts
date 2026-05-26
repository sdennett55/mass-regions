import {
  applyAction,
  buildTownVisualStates,
  createPlayerState,
  ensureActiveSeasonState,
  getRegionControlCountsFromSeason,
  getSeasonTimeRemaining,
  getSeasonWindow,
  getTimeUntilNextActionPoint,
  regeneratePlayerActionPoints,
  spendPlayerActionPoints,
} from "../../src/game/logic.ts"
import { sharedTownNeighbors } from "../../src/game/townNeighbors.ts"
import type {
  PlayerAction,
  PlayerState,
  SeasonState,
  TownNeighbors,
} from "../../src/game/types.ts"

import type {
  ServerActionResponse,
  ServerGameSnapshot,
} from "./protocol.ts"
import type { ServerPersistence } from "./persistence.ts"

type StoreListener = () => void

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

  private emitChange() {
    this.revision += 1
    this.persistence.saveSeasonState(this.seasonState)
    this.persistence.saveRevision(this.revision)
    for (const listener of this.listeners) {
      listener()
    }
  }

  private ensureSeason(now: number) {
    const nextSeasonState = ensureActiveSeasonState(this.seasonState, now)
    if (nextSeasonState !== this.seasonState) {
      this.seasonState = nextSeasonState
      this.emitChange()
    }
  }

  private ensurePlayer(playerId: string, now: number) {
    const existingPlayer =
      this.playerStates.get(playerId) ?? this.persistence.loadPlayerState(playerId)
    if (!existingPlayer) {
      const nextPlayer = createPlayerState(now)
      this.playerStates.set(playerId, nextPlayer)
      this.persistence.savePlayerState(playerId, nextPlayer)
      return nextPlayer
    }

    const refreshedPlayer = regeneratePlayerActionPoints(existingPlayer, now)
    if (
      refreshedPlayer.actionPoints !== existingPlayer.actionPoints ||
      refreshedPlayer.lastRegeneratedAt !== existingPlayer.lastRegeneratedAt
    ) {
      this.playerStates.set(playerId, refreshedPlayer)
      this.persistence.savePlayerState(playerId, refreshedPlayer)
    }

    return refreshedPlayer
  }

  private getCapturedTownCount(snapshot: ServerGameSnapshot) {
    return Object.values(snapshot.townVisualStates).filter(
      (townVisualState) => townVisualState.isCaptureProtected,
    ).length
  }

  getSnapshot(playerId: string, now = Date.now()): ServerGameSnapshot {
    this.ensureSeason(now)
    const player = this.ensurePlayer(playerId, now)
    const townVisualStates = buildTownVisualStates(
      this.seasonState,
      this.townNeighbors,
      now,
    )
    const seasonWindow = getSeasonWindow(now)

    const snapshot: ServerGameSnapshot = {
      contestedTownCount: Object.values(this.seasonState.towns).filter(
        (town) => town.isContested,
      ).length,
      controlCounts: getRegionControlCountsFromSeason(this.seasonState),
      nextActionPointIn: getTimeUntilNextActionPoint(player, now),
      player,
      revision: this.revision,
      season: this.seasonState,
      seasonLabel: `Season ${seasonWindow.seasonNumber}`,
      seasonTimeRemaining: getSeasonTimeRemaining(this.seasonState, now),
      serverTime: now,
      townVisualStates,
      capturedTownCount: 0,
    }

    snapshot.capturedTownCount = this.getCapturedTownCount(snapshot)
    return snapshot
  }

  applyPlayerAction(
    playerId: string,
    action: PlayerAction,
    now = Date.now(),
  ): ServerActionResponse {
    this.ensureSeason(now)
    const player = this.ensurePlayer(playerId, now)
    const nextPlayerState = spendPlayerActionPoints(player, now)

    if (!nextPlayerState) {
      return {
        error: "No action points available.",
        ok: false,
        snapshot: this.getSnapshot(playerId, now),
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
        snapshot: this.getSnapshot(playerId, now),
      }
    }

    this.playerStates.set(playerId, nextPlayerState)
    this.persistence.savePlayerState(playerId, nextPlayerState)
    this.seasonState = actionResult.season
    this.emitChange()

    return {
      ok: true,
      snapshot: this.getSnapshot(playerId, now),
    }
  }

  subscribe(listener: StoreListener) {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }
}

import { createPlayerState, createSeasonState, ensureActiveSeasonState } from "./logic"
import {
  PLAYER_ID_STORAGE_KEY,
  PLAYER_STATE_STORAGE_KEY,
  SEASON_STATE_STORAGE_KEY,
} from "./constants"
import type { PlayerState, SeasonState } from "./types"

const REFILL_ACTION_POINTS_QUERY_PARAM = "refillActionPoints"
const LEGACY_REFILL_ACTION_POINTS_QUERY_PARAM = "refillInfluence"
const RESET_GAME_QUERY_PARAM = "resetGame"

function canUseStorage() {
  return typeof window !== "undefined"
}

function shouldRefillActionPointsFromUrl() {
  if (!canUseStorage()) {
    return false
  }

  try {
    const searchParams = new URLSearchParams(window.location.search)
    const refillActionPointsParam =
      searchParams.get(REFILL_ACTION_POINTS_QUERY_PARAM) ??
      searchParams.get(LEGACY_REFILL_ACTION_POINTS_QUERY_PARAM)

    return (
      refillActionPointsParam !== null &&
      refillActionPointsParam !== "0" &&
      refillActionPointsParam.toLowerCase() !== "false"
    )
  } catch {
    return false
  }
}

function shouldResetGameFromUrl() {
  if (!canUseStorage()) {
    return false
  }

  try {
    const resetGameParam = new URLSearchParams(window.location.search).get(
      RESET_GAME_QUERY_PARAM,
    )

    return (
      resetGameParam !== null &&
      resetGameParam !== "0" &&
      resetGameParam.toLowerCase() !== "false"
    )
  } catch {
    return false
  }
}

export function ensureAnonymousPlayerId() {
  if (!canUseStorage()) {
    return "local-player"
  }

  try {
    if (shouldResetGameFromUrl() || shouldRefillActionPointsFromUrl()) {
      const resetId =
        typeof window.crypto?.randomUUID === "function"
          ? window.crypto.randomUUID()
          : `player-${Date.now()}`

      window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, resetId)
      return resetId
    }

    const existingId = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY)
    if (existingId) {
      return existingId
    }

    const nextId =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `player-${Date.now()}`

    window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, nextId)
    return nextId
  } catch {
    return "local-player"
  }
}

export function loadPlayerState(now = Date.now()) {
  if (!canUseStorage()) {
    return createPlayerState(now)
  }

  try {
    if (shouldResetGameFromUrl()) {
      return createPlayerState(now)
    }

    if (shouldRefillActionPointsFromUrl()) {
      return createPlayerState(now)
    }

    const rawPlayerState = window.localStorage.getItem(PLAYER_STATE_STORAGE_KEY)
    if (!rawPlayerState) {
      return createPlayerState(now)
    }

    const parsedPlayerState = JSON.parse(rawPlayerState) as Partial<PlayerState> & {
      influencePoints?: number
    }
    const actionPoints =
      typeof parsedPlayerState.actionPoints === "number"
        ? parsedPlayerState.actionPoints
        : typeof parsedPlayerState.influencePoints === "number"
          ? parsedPlayerState.influencePoints
          : null

    if (actionPoints === null || typeof parsedPlayerState.lastRegeneratedAt !== "number") {
      return createPlayerState(now)
    }

    return {
      actionPoints,
      lastRegeneratedAt: parsedPlayerState.lastRegeneratedAt,
    }
  } catch {
    return createPlayerState(now)
  }
}

export function savePlayerState(playerState: PlayerState) {
  if (!canUseStorage()) {
    return
  }

  try {
    window.localStorage.setItem(PLAYER_STATE_STORAGE_KEY, JSON.stringify(playerState))
  } catch {
    // Ignore locked-down storage.
  }
}

export function loadSeasonState(now = Date.now()) {
  if (!canUseStorage()) {
    return createSeasonState(now)
  }

  try {
    if (shouldResetGameFromUrl()) {
      return createSeasonState(now)
    }

    const rawSeasonState = window.localStorage.getItem(SEASON_STATE_STORAGE_KEY)
    if (!rawSeasonState) {
      return createSeasonState(now)
    }

    const parsedSeasonState = JSON.parse(rawSeasonState) as SeasonState
    return ensureActiveSeasonState(parsedSeasonState, now)
  } catch {
    return createSeasonState(now)
  }
}

export function saveSeasonState(seasonState: SeasonState) {
  if (!canUseStorage()) {
    return
  }

  try {
    window.localStorage.setItem(SEASON_STATE_STORAGE_KEY, JSON.stringify(seasonState))
  } catch {
    // Ignore locked-down storage.
  }
}

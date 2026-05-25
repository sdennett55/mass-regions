import { createPlayerState, createSeasonState, ensureActiveSeasonState } from './logic'
import {
  PLAYER_ID_STORAGE_KEY,
  PLAYER_STATE_STORAGE_KEY,
  SEASON_STATE_STORAGE_KEY,
} from './constants'
import type { PlayerState, SeasonState } from './types'

const REFILL_INFLUENCE_QUERY_PARAM = 'refillInfluence'

function canUseStorage() {
  return typeof window !== 'undefined'
}

function shouldRefillInfluenceFromUrl() {
  if (!canUseStorage()) {
    return false
  }

  try {
    const refillInfluenceParam = new URLSearchParams(window.location.search).get(
      REFILL_INFLUENCE_QUERY_PARAM,
    )

    return (
      refillInfluenceParam !== null &&
      refillInfluenceParam !== '0' &&
      refillInfluenceParam.toLowerCase() !== 'false'
    )
  } catch {
    return false
  }
}

export function ensureAnonymousPlayerId() {
  if (!canUseStorage()) {
    return 'local-player'
  }

  try {
    const existingId = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY)
    if (existingId) {
      return existingId
    }

    const nextId =
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `player-${Date.now()}`

    window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, nextId)
    return nextId
  } catch {
    return 'local-player'
  }
}

export function loadPlayerState(now = Date.now()) {
  if (!canUseStorage()) {
    return createPlayerState(now)
  }

  try {
    if (shouldRefillInfluenceFromUrl()) {
      return createPlayerState(now)
    }

    const rawPlayerState = window.localStorage.getItem(PLAYER_STATE_STORAGE_KEY)
    if (!rawPlayerState) {
      return createPlayerState(now)
    }

    const parsedPlayerState = JSON.parse(rawPlayerState) as Partial<PlayerState>
    if (
      typeof parsedPlayerState.influencePoints !== 'number' ||
      typeof parsedPlayerState.lastRegeneratedAt !== 'number'
    ) {
      return createPlayerState(now)
    }

    return {
      influencePoints: parsedPlayerState.influencePoints,
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
    const rawSeasonState = window.localStorage.getItem(SEASON_STATE_STORAGE_KEY)
    if (!rawSeasonState) {
      return createSeasonState(now)
    }

    const parsedSeasonState = JSON.parse(rawSeasonState) as SeasonState
    if (
      !parsedSeasonState ||
      typeof parsedSeasonState.seasonId !== 'string' ||
      typeof parsedSeasonState.startedAt !== 'number' ||
      typeof parsedSeasonState.endsAt !== 'number' ||
      typeof parsedSeasonState.towns !== 'object'
    ) {
      return createSeasonState(now)
    }

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

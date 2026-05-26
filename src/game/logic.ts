import {
  formatTownLabel,
  getRegionColor,
  regionOrder,
  type RegionName,
} from "../data/massRegions"

import {
  CAPTURE_POINTS_TO_CAPTURE,
  CAPTURE_PROTECTION_WINDOW_MS,
  DEFEND_PROGRESS_AMOUNT,
  INVADE_PROGRESS_AMOUNT,
  PLAYER_ACTION_COST,
  PLAYER_ACTION_REGEN_INTERVAL_MS,
  PLAYER_MAX_ACTION_POINTS,
  RECENT_CAPTURE_WINDOW_MS,
  SEASON_DURATION_MS,
  SEASON_EPOCH_MS,
} from "./constants"
import type {
  ActionResult,
  PlayerAction,
  PlayerState,
  RegionControlGroup,
  RegionalClaims,
  SeasonState,
  TownBattleState,
  TownName,
  TownNeighbors,
  TownVisualState,
} from "./types"
import { baselineTownRegions, regionalClaims as defaultRegionalClaims } from "./world"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeCaptureProgress(value: number) {
  return clamp(Math.round(value), 0, CAPTURE_POINTS_TO_CAPTURE - 1)
}

function clearContest(town: TownBattleState): TownBattleState {
  return {
    ...town,
    captureProgress: 0,
    contestingRegion: null,
    isContested: false,
  }
}

function normalizeResolvedTown(town: TownBattleState): TownBattleState {
  if (town.contestingRegion === town.currentRegion) {
    return clearContest(town)
  }

  if (!town.contestingRegion || town.captureProgress <= 0) {
    return clearContest(town)
  }

  return {
    ...town,
    captureProgress: normalizeCaptureProgress(town.captureProgress),
    isContested: true,
  }
}

function normalizeCapturedTown(
  town: TownBattleState,
  nextRegion: RegionName,
  now: number,
): TownBattleState {
  return {
    ...town,
    captureProgress: 0,
    contestingRegion: null,
    currentRegion: nextRegion,
    isContested: false,
    lastCapturedAt: now,
  }
}

function coerceTownBattleState(
  townName: TownName,
  baselineRegion: RegionName,
  rawTown: unknown,
): TownBattleState | null {
  if (!rawTown || typeof rawTown !== "object") {
    return null
  }

  const parsedTown = rawTown as Partial<TownBattleState>

  if (
    typeof parsedTown.currentRegion !== "string" ||
    typeof parsedTown.baselineRegion !== "string" ||
    typeof parsedTown.captureProgress !== "number"
  ) {
    return null
  }

  const contestingRegion =
    typeof parsedTown.contestingRegion === "string"
      ? parsedTown.contestingRegion
      : null
  const lastCapturedAt =
    typeof parsedTown.lastCapturedAt === "number"
      ? parsedTown.lastCapturedAt
      : undefined

  return normalizeResolvedTown({
    baselineRegion,
    captureProgress: parsedTown.captureProgress,
    contestingRegion,
    currentRegion: parsedTown.currentRegion,
    isContested: false,
    lastCapturedAt,
    townName,
  })
}

function isResolvedTownBattleState(rawTown: unknown): rawTown is TownBattleState {
  if (!rawTown || typeof rawTown !== "object") {
    return false
  }

  const parsedTown = rawTown as Partial<TownBattleState>

  return (
    typeof parsedTown.townName === "string" &&
    typeof parsedTown.currentRegion === "string" &&
    typeof parsedTown.baselineRegion === "string" &&
    typeof parsedTown.captureProgress === "number" &&
    typeof parsedTown.isContested === "boolean" &&
    (typeof parsedTown.contestingRegion === "string" ||
      parsedTown.contestingRegion === null) &&
    (typeof parsedTown.lastCapturedAt === "number" ||
      typeof parsedTown.lastCapturedAt === "undefined")
  )
}

function isResolvedSeasonState(season: SeasonState) {
  if (!season.towns || typeof season.towns !== "object") {
    return false
  }

  for (const townName of Object.keys(baselineTownRegions)) {
    if (!isResolvedTownBattleState(season.towns[townName])) {
      return false
    }
  }

  return true
}

function hydrateSeasonState(season: SeasonState): SeasonState | null {
  if (
    !season ||
    typeof season.seasonId !== "string" ||
    typeof season.startedAt !== "number" ||
    typeof season.endsAt !== "number" ||
    !season.towns ||
    typeof season.towns !== "object"
  ) {
    return null
  }

  const towns = {} as Record<TownName, TownBattleState>

  for (const [townName, baselineRegion] of Object.entries(baselineTownRegions)) {
    const hydratedTown = coerceTownBattleState(
      townName,
      baselineRegion,
      (season.towns as Record<string, unknown>)[townName],
    )

    if (!hydratedTown) {
      return null
    }

    towns[townName] = hydratedTown
  }

  return {
    endsAt: season.endsAt,
    seasonId: season.seasonId,
    startedAt: season.startedAt,
    towns,
  }
}

export function isTownCaptureProtected(
  town: Pick<TownBattleState, "lastCapturedAt">,
  now = Date.now(),
) {
  return (
    typeof town.lastCapturedAt === "number" &&
    now - town.lastCapturedAt < CAPTURE_PROTECTION_WINDOW_MS
  )
}

export function getTownCaptureProtectionRemaining(
  town: Pick<TownBattleState, "lastCapturedAt">,
  now = Date.now(),
) {
  if (!isTownCaptureProtected(town, now) || typeof town.lastCapturedAt !== "number") {
    return 0
  }

  return Math.max(0, town.lastCapturedAt + CAPTURE_PROTECTION_WINDOW_MS - now)
}

export function createPlayerState(now = Date.now()): PlayerState {
  return {
    actionPoints: PLAYER_MAX_ACTION_POINTS,
    lastRegeneratedAt: now,
  }
}

export function regeneratePlayerActionPoints(player: PlayerState, now = Date.now()) {
  const safeLastRegeneratedAt = Math.min(player.lastRegeneratedAt, now)
  const elapsed = now - safeLastRegeneratedAt
  const recoveredPoints = Math.floor(elapsed / PLAYER_ACTION_REGEN_INTERVAL_MS)

  if (recoveredPoints <= 0) {
    return {
      ...player,
      lastRegeneratedAt: safeLastRegeneratedAt,
    }
  }

  const nextActionPoints = Math.min(
    PLAYER_MAX_ACTION_POINTS,
    player.actionPoints + recoveredPoints,
  )
  const spentIntervals =
    nextActionPoints >= PLAYER_MAX_ACTION_POINTS
      ? Math.max(0, PLAYER_MAX_ACTION_POINTS - player.actionPoints)
      : recoveredPoints

  return {
    actionPoints: nextActionPoints,
    lastRegeneratedAt:
      safeLastRegeneratedAt + spentIntervals * PLAYER_ACTION_REGEN_INTERVAL_MS,
  }
}

export function getTimeUntilNextActionPoint(player: PlayerState, now = Date.now()) {
  const resolvedPlayer = regeneratePlayerActionPoints(player, now)

  if (resolvedPlayer.actionPoints >= PLAYER_MAX_ACTION_POINTS) {
    return 0
  }

  return Math.max(
    0,
    PLAYER_ACTION_REGEN_INTERVAL_MS - (now - resolvedPlayer.lastRegeneratedAt),
  )
}

export function spendPlayerActionPoints(
  player: PlayerState,
  now = Date.now(),
  amount = PLAYER_ACTION_COST,
) {
  const resolvedPlayer = regeneratePlayerActionPoints(player, now)

  if (resolvedPlayer.actionPoints < amount) {
    return null
  }

  return {
    actionPoints: resolvedPlayer.actionPoints - amount,
    lastRegeneratedAt: resolvedPlayer.lastRegeneratedAt,
  }
}

export function getSeasonWindow(now = Date.now()) {
  const rawSeasonIndex = Math.max(0, Math.floor((now - SEASON_EPOCH_MS) / SEASON_DURATION_MS))
  const startedAt = SEASON_EPOCH_MS + rawSeasonIndex * SEASON_DURATION_MS

  return {
    endsAt: startedAt + SEASON_DURATION_MS,
    seasonId: `season-${rawSeasonIndex + 1}`,
    seasonNumber: rawSeasonIndex + 1,
    startedAt,
  }
}

export function createTownBattleState(
  townName: TownName,
  baselineRegion: RegionName,
): TownBattleState {
  return {
    baselineRegion,
    captureProgress: 0,
    contestingRegion: null,
    currentRegion: baselineRegion,
    isContested: false,
    townName,
  }
}

export function createSeasonState(now = Date.now()): SeasonState {
  const { endsAt, seasonId, startedAt } = getSeasonWindow(now)

  return {
    endsAt,
    seasonId,
    startedAt,
    towns: Object.fromEntries(
      Object.entries(baselineTownRegions).map(([townName, baselineRegion]) => [
        townName,
        createTownBattleState(townName, baselineRegion),
      ]),
    ) as Record<TownName, TownBattleState>,
  }
}

export function ensureActiveSeasonState(season: SeasonState | null | undefined, now = Date.now()) {
  const { seasonId } = getSeasonWindow(now)

  if (!season || season.seasonId !== seasonId) {
    return createSeasonState(now)
  }

  if (isResolvedSeasonState(season)) {
    return season
  }

  return hydrateSeasonState(season) ?? createSeasonState(now)
}

export function getSeasonTimeRemaining(season: SeasonState, now = Date.now()) {
  return Math.max(0, season.endsAt - now)
}

export function getValidInvadingRegions(params: {
  claims?: RegionalClaims
  season: SeasonState
  townName: TownName
  townNeighbors: TownNeighbors
}) {
  const {
    claims = defaultRegionalClaims,
    season,
    townName,
    townNeighbors,
  } = params
  const town = season.towns[townName]

  if (!town) {
    return []
  }

  const validRegions = new Set<RegionName>()

  for (const neighborTown of townNeighbors[townName] ?? []) {
    const neighborRegion = season.towns[neighborTown]?.currentRegion

    if (neighborRegion) {
      validRegions.add(neighborRegion)
    }
  }

  validRegions.add(town.baselineRegion)

  for (const claimRegion of claims[townName] ?? []) {
    validRegions.add(claimRegion)
  }

  if (town.contestingRegion) {
    validRegions.add(town.contestingRegion)
  }

  validRegions.delete(town.currentRegion)

  return [...validRegions].sort(
    (regionA, regionB) => regionOrder.indexOf(regionA) - regionOrder.indexOf(regionB),
  )
}

export function canRegionInvadeTown(params: {
  claims?: RegionalClaims
  invadingRegion: RegionName
  season: SeasonState
  townName: TownName
  townNeighbors: TownNeighbors
}) {
  const { invadingRegion, season, townName, townNeighbors } = params

  return getValidInvadingRegions({
    claims: params.claims,
    season,
    townName,
    townNeighbors,
  }).includes(invadingRegion)
}

export function applyAction(params: {
  action: PlayerAction
  claims?: RegionalClaims
  now?: number
  season: SeasonState
  townNeighbors: TownNeighbors
}): ActionResult {
  const {
    action,
    claims = defaultRegionalClaims,
    now = Date.now(),
    season,
    townNeighbors,
  } = params
  const currentTown = season.towns[action.townName]

  if (!currentTown) {
    return {
      error: "Territory unavailable.",
      ok: false,
      season,
    }
  }

  if (isTownCaptureProtected(currentTown, now)) {
    return {
      error: "Capture cooldown active.",
      ok: false,
      season,
    }
  }

  let nextTown: TownBattleState

  if (action.type === "defend") {
    if (!currentTown.isContested || !currentTown.contestingRegion) {
      return {
        error: "No active invasion to defend.",
        ok: false,
        season,
      }
    }

    nextTown =
      currentTown.captureProgress - DEFEND_PROGRESS_AMOUNT <= 0
        ? clearContest(currentTown)
        : normalizeResolvedTown({
            ...currentTown,
            captureProgress: currentTown.captureProgress - DEFEND_PROGRESS_AMOUNT,
          })
  } else if (action.type === "invade") {
    if (
      !canRegionInvadeTown({
        claims,
        invadingRegion: action.invadingRegion,
        season,
        townName: action.townName,
        townNeighbors,
      })
    ) {
      return {
        error: "No frontline route for that invasion.",
        ok: false,
        season,
      }
    }

    if (currentTown.isContested && currentTown.contestingRegion !== action.invadingRegion) {
      return {
        error: "Another invasion is already underway.",
        ok: false,
        season,
      }
    }

    const nextProgress = currentTown.captureProgress + INVADE_PROGRESS_AMOUNT

    nextTown =
      nextProgress >= CAPTURE_POINTS_TO_CAPTURE
        ? normalizeCapturedTown(currentTown, action.invadingRegion, now)
        : normalizeResolvedTown({
            ...currentTown,
            captureProgress: nextProgress,
            contestingRegion: action.invadingRegion,
          })
  } else {
    return {
      error: "Action unavailable.",
      ok: false,
      season,
    }
  }

  return {
    ok: true,
    season: {
      ...season,
      towns: {
        ...season.towns,
        [action.townName]: nextTown,
      },
    },
    town: nextTown,
  }
}

export function buildRegionControlLegend(season: SeasonState): RegionControlGroup[] {
  const townsByRegion = new Map<RegionName, string[]>(
    regionOrder.map((region) => [region, []]),
  )

  for (const town of Object.values(season.towns)) {
    townsByRegion.get(town.currentRegion)?.push(formatTownLabel(town.townName))
  }

  return regionOrder.map((region) => {
    const towns = (townsByRegion.get(region) ?? []).sort((townA, townB) =>
      townA.localeCompare(townB),
    )

    return {
      color: getRegionColor(region),
      region,
      townCount: towns.length,
      towns,
    }
  })
}

export function getEmptyRegionControlCounts() {
  return Object.fromEntries(regionOrder.map((region) => [region, 0])) as Record<
    RegionName,
    number
  >
}

export function getRegionControlCountsFromSeason(season: SeasonState) {
  const counts = getEmptyRegionControlCounts()

  for (const town of Object.values(season.towns)) {
    counts[town.currentRegion] += 1
  }

  return counts
}

export function buildTownVisualStates(
  season: SeasonState,
  townNeighbors: TownNeighbors,
  now = Date.now(),
) {
  return Object.fromEntries(
    Object.values(season.towns).map((town) => {
      const isFrontline =
        town.isContested ||
        (townNeighbors[town.townName] ?? []).some(
          (neighborTown) =>
            season.towns[neighborTown] &&
            season.towns[neighborTown].currentRegion !== town.currentRegion,
        )

      const visualState: TownVisualState = {
        captureProgress: town.captureProgress,
        contestingRegion: town.contestingRegion,
        currentRegion: town.currentRegion,
        isCaptureProtected: isTownCaptureProtected(town, now),
        isContested: town.isContested,
        isFrontline,
        isRecentlyCaptured:
          typeof town.lastCapturedAt === "number" &&
          now - town.lastCapturedAt <= RECENT_CAPTURE_WINDOW_MS,
      }

      return [town.townName, visualState]
    }),
  ) as Record<TownName, TownVisualState>
}

export function getNextRecentCaptureExpiryAt(
  season: SeasonState,
  now = Date.now(),
) {
  let nextExpiryAt: number | null = null

  for (const town of Object.values(season.towns)) {
    if (typeof town.lastCapturedAt !== "number") {
      continue
    }

    const expiryAt = town.lastCapturedAt + RECENT_CAPTURE_WINDOW_MS
    if (expiryAt <= now) {
      continue
    }

    if (nextExpiryAt === null || expiryAt < nextExpiryAt) {
      nextExpiryAt = expiryAt
    }
  }

  return nextExpiryAt
}

export function getNextTownVisualExpiryAt(
  season: SeasonState,
  now = Date.now(),
) {
  let nextExpiryAt: number | null = getNextRecentCaptureExpiryAt(season, now)

  for (const town of Object.values(season.towns)) {
    if (typeof town.lastCapturedAt !== "number") {
      continue
    }

    const captureProtectionExpiryAt =
      town.lastCapturedAt + CAPTURE_PROTECTION_WINDOW_MS

    if (
      captureProtectionExpiryAt > now &&
      (nextExpiryAt === null || captureProtectionExpiryAt < nextExpiryAt)
    ) {
      nextExpiryAt = captureProtectionExpiryAt
    }
  }

  return nextExpiryAt
}

export function formatDurationShort(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return `${days}d ${hours}h`
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

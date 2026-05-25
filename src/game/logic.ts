import {
  formatTownLabel,
  getRegionColor,
  regionOrder,
  type RegionName,
} from '../data/massRegions'

import {
  BASELINE_REGION_INFLUENCE,
  BASELINE_STABILITY,
  CAPTURE_INFLUENCE_DECAY_FACTOR,
  CAPTURE_PROTECTION_WINDOW_MS,
  CAPTURE_STABILITY_RESET,
  CONTESTED_LEAD_THRESHOLD,
  CONTESTED_STABILITY_THRESHOLD,
  DESTABILIZE_AMOUNT,
  FLIP_LEAD_REQUIRED,
  INVADE_AMOUNT,
  INVADE_STABILITY_DAMAGE,
  LOW_STABILITY_THRESHOLD,
  MAX_STABILITY,
  MIN_STABILITY,
  PLAYER_ACTION_COST,
  PLAYER_MAX_INFLUENCE_POINTS,
  PLAYER_REGEN_INTERVAL_MS,
  RECENT_CAPTURE_WINDOW_MS,
  REINFORCE_AMOUNT,
  REINFORCE_STABILITY_GAIN,
  SEASON_DURATION_MS,
  SEASON_EPOCH_MS,
  STABILITY_FLIP_THRESHOLD,
} from './constants'
import type {
  ActionResult,
  InfluenceBreakdownEntry,
  PlayerAction,
  PlayerState,
  RegionControlGroup,
  RegionalClaims,
  SeasonState,
  TownBattleState,
  TownName,
  TownNeighbors,
  TownVisualState,
} from './types'
import { baselineTownRegions, regionalClaims as defaultRegionalClaims } from './world'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function createInfluenceByRegion(partial?: Partial<Record<RegionName, number>>) {
  return Object.fromEntries(
    regionOrder.map((region) => [region, partial?.[region] ?? 0]),
  ) as Record<RegionName, number>
}

function getInfluenceEntries(town: TownBattleState) {
  return regionOrder
    .map((region) => ({
      influence: town.influenceByRegion[region] ?? 0,
      region,
    }))
    .sort((a, b) => b.influence - a.influence || a.region.localeCompare(b.region))
}

function getInfluenceLeader(town: TownBattleState) {
  const [leader, runnerUp] = getInfluenceEntries(town)

  return {
    lead: (leader?.influence ?? 0) - (runnerUp?.influence ?? 0),
    leader,
    runnerUp,
  }
}

function normalizeCapturedTown(
  town: TownBattleState,
  nextRegion: RegionName,
  now: number,
): TownBattleState {
  const nextInfluenceByRegion = createInfluenceByRegion()

  for (const region of regionOrder) {
    nextInfluenceByRegion[region] = Math.round(
      (town.influenceByRegion[region] ?? 0) * CAPTURE_INFLUENCE_DECAY_FACTOR,
    )
  }

  nextInfluenceByRegion[nextRegion] = Math.max(
    nextInfluenceByRegion[nextRegion],
    BASELINE_REGION_INFLUENCE,
  )

  return {
    ...town,
    currentRegion: nextRegion,
    influenceByRegion: nextInfluenceByRegion,
    lastCapturedAt: now,
    stability: CAPTURE_STABILITY_RESET,
  }
}

export function isTownCaptureProtected(
  town: Pick<TownBattleState, 'lastCapturedAt'>,
  now = Date.now(),
) {
  return (
    typeof town.lastCapturedAt === 'number' &&
    now - town.lastCapturedAt < CAPTURE_PROTECTION_WINDOW_MS
  )
}

export function getTownCaptureProtectionRemaining(
  town: Pick<TownBattleState, 'lastCapturedAt'>,
  now = Date.now(),
) {
  if (!isTownCaptureProtected(town, now) || typeof town.lastCapturedAt !== 'number') {
    return 0
  }

  return Math.max(0, town.lastCapturedAt + CAPTURE_PROTECTION_WINDOW_MS - now)
}

function finalizeTownBattleState(town: TownBattleState, now: number): TownBattleState {
  const clampedTown: TownBattleState = {
    ...town,
    stability: clamp(town.stability, MIN_STABILITY, MAX_STABILITY),
  }

  const { lead, leader } = getInfluenceLeader(clampedTown)
  const currentRegionInfluence = clampedTown.influenceByRegion[clampedTown.currentRegion] ?? 0

  const shouldFlip =
    !!leader &&
    leader.region !== clampedTown.currentRegion &&
    leader.influence > currentRegionInfluence &&
    lead >= FLIP_LEAD_REQUIRED &&
    clampedTown.stability <= STABILITY_FLIP_THRESHOLD

  const resolvedTown = shouldFlip
    ? normalizeCapturedTown(clampedTown, leader.region, now)
    : clampedTown

  const { lead: resolvedLead, leader: resolvedLeader } = getInfluenceLeader(resolvedTown)
  const isCaptureProtected = isTownCaptureProtected(resolvedTown, now)

  return {
    ...resolvedTown,
    isContested:
      !isCaptureProtected &&
      (resolvedTown.stability <= CONTESTED_STABILITY_THRESHOLD ||
        (resolvedLeader?.region ?? resolvedTown.currentRegion) !== resolvedTown.currentRegion ||
        resolvedLead <= CONTESTED_LEAD_THRESHOLD),
  }
}

export function createPlayerState(now = Date.now()): PlayerState {
  return {
    influencePoints: PLAYER_MAX_INFLUENCE_POINTS,
    lastRegeneratedAt: now,
  }
}

export function regeneratePlayerInfluence(player: PlayerState, now = Date.now()) {
  const safeLastRegeneratedAt = Math.min(player.lastRegeneratedAt, now)
  const elapsed = now - safeLastRegeneratedAt
  const recoveredPoints = Math.floor(elapsed / PLAYER_REGEN_INTERVAL_MS)

  if (recoveredPoints <= 0) {
    return {
      ...player,
      lastRegeneratedAt: safeLastRegeneratedAt,
    }
  }

  const nextInfluencePoints = Math.min(
    PLAYER_MAX_INFLUENCE_POINTS,
    player.influencePoints + recoveredPoints,
  )
  const spentIntervals =
    nextInfluencePoints >= PLAYER_MAX_INFLUENCE_POINTS
      ? Math.max(0, PLAYER_MAX_INFLUENCE_POINTS - player.influencePoints)
      : recoveredPoints

  return {
    influencePoints: nextInfluencePoints,
    lastRegeneratedAt:
      safeLastRegeneratedAt + spentIntervals * PLAYER_REGEN_INTERVAL_MS,
  }
}

export function getTimeUntilNextInfluence(player: PlayerState, now = Date.now()) {
  const resolvedPlayer = regeneratePlayerInfluence(player, now)

  if (resolvedPlayer.influencePoints >= PLAYER_MAX_INFLUENCE_POINTS) {
    return 0
  }

  return Math.max(
    0,
    PLAYER_REGEN_INTERVAL_MS - (now - resolvedPlayer.lastRegeneratedAt),
  )
}

export function spendPlayerInfluence(
  player: PlayerState,
  now = Date.now(),
  amount = PLAYER_ACTION_COST,
) {
  const resolvedPlayer = regeneratePlayerInfluence(player, now)

  if (resolvedPlayer.influencePoints < amount) {
    return null
  }

  return {
    influencePoints: resolvedPlayer.influencePoints - amount,
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
    currentRegion: baselineRegion,
    influenceByRegion: createInfluenceByRegion({
      [baselineRegion]: BASELINE_REGION_INFLUENCE,
    }),
    isContested: false,
    stability: BASELINE_STABILITY,
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

  return season
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

  if (isTownCaptureProtected(town)) {
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
      error: 'Town unavailable.',
      ok: false,
      season,
    }
  }

  const nextInfluenceByRegion = { ...currentTown.influenceByRegion }
  let nextStability = currentTown.stability

  if (action.type === 'reinforce') {
    nextInfluenceByRegion[currentTown.currentRegion] += REINFORCE_AMOUNT
    nextStability += REINFORCE_STABILITY_GAIN
  } else if (action.type === 'destabilize') {
    if (isTownCaptureProtected(currentTown, now)) {
      return {
        error: 'Capture cooldown active.',
        ok: false,
        season,
      }
    }

    nextStability -= DESTABILIZE_AMOUNT
  } else if (action.type === 'invade') {
    if (isTownCaptureProtected(currentTown, now)) {
      return {
        error: 'Capture cooldown active.',
        ok: false,
        season,
      }
    }

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
        error: 'No frontline route for that invasion.',
        ok: false,
        season,
      }
    }

    nextInfluenceByRegion[action.invadingRegion] += INVADE_AMOUNT
    nextStability -= INVADE_STABILITY_DAMAGE
  } else {
    return {
      error: 'Action unavailable.',
      ok: false,
      season,
    }
  }

  const nextTown = finalizeTownBattleState(
    {
      ...currentTown,
      influenceByRegion: nextInfluenceByRegion,
      stability: nextStability,
    },
    now,
  )

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

export function getInfluenceBreakdown(town: TownBattleState): InfluenceBreakdownEntry[] {
  const totalInfluence = regionOrder.reduce(
    (sum, region) => sum + (town.influenceByRegion[region] ?? 0),
    0,
  )
  const safeTotal = Math.max(totalInfluence, 1)

  return getInfluenceEntries(town)
    .filter((entry) => entry.influence > 0)
    .map((entry) => ({
      influence: entry.influence,
      region: entry.region,
      share: entry.influence / safeTotal,
    }))
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
      const isFrontline = (townNeighbors[town.townName] ?? []).some(
        (neighborTown) =>
          season.towns[neighborTown] &&
          season.towns[neighborTown].currentRegion !== town.currentRegion,
      )

      const visualState: TownVisualState = {
        currentRegion: town.currentRegion,
        isCaptureProtected: isTownCaptureProtected(town, now),
        isContested: town.isContested,
        isFrontline,
        isLowStability: town.stability <= LOW_STABILITY_THRESHOLD,
        isRecentlyCaptured:
          typeof town.lastCapturedAt === 'number' &&
          now - town.lastCapturedAt <= RECENT_CAPTURE_WINDOW_MS,
        stability: town.stability,
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
    if (typeof town.lastCapturedAt !== 'number') {
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

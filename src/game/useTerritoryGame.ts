import { useEffect, useMemo, useState } from "react"

import {
  GAME_CLOCK_INTERVAL_MS,
  PLAYER_ACTION_COST,
} from "./constants"
import {
  applyAction,
  buildRegionControlLegend,
  buildTownVisualStates,
  ensureActiveSeasonState,
  formatDurationShort,
  getNextRecentCaptureExpiryAt,
  getRegionControlCountsFromSeason,
  getSeasonTimeRemaining,
  getSeasonWindow,
  getTimeUntilNextActionPoint,
  getTownCaptureProtectionRemaining,
  getValidInvadingRegions,
  regeneratePlayerActionPoints,
  spendPlayerActionPoints,
} from "./logic"
import {
  ensureAnonymousPlayerId,
  loadPlayerState,
  loadSeasonState,
  savePlayerState,
  saveSeasonState,
} from "./storage"
import type { PlayerAction, RegionName, TownName, TownNeighbors } from "./types"

function arePlayerStatesEqual(
  a: { actionPoints: number; lastRegeneratedAt: number },
  b: { actionPoints: number; lastRegeneratedAt: number },
) {
  return (
    a.actionPoints === b.actionPoints &&
    a.lastRegeneratedAt === b.lastRegeneratedAt
  )
}

export function useTerritoryGame(townNeighbors: TownNeighbors) {
  const [now, setNow] = useState(() => Date.now())
  const [captureVisualNow, setCaptureVisualNow] = useState(() => Date.now())
  const [playerState, setPlayerState] = useState(() => loadPlayerState(Date.now()))
  const [seasonState, setSeasonState] = useState(() => loadSeasonState(Date.now()))
  const [spendFeedbackKey, setSpendFeedbackKey] = useState<number | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    ensureAnonymousPlayerId()
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const tickNow = Date.now()

      setNow(tickNow)
      setPlayerState((currentPlayerState) => {
        const nextPlayerState = regeneratePlayerActionPoints(currentPlayerState, tickNow)
        return arePlayerStatesEqual(currentPlayerState, nextPlayerState)
          ? currentPlayerState
          : nextPlayerState
      })
      setSeasonState((currentSeasonState) => {
        const nextSeasonState = ensureActiveSeasonState(currentSeasonState, tickNow)

        if (nextSeasonState !== currentSeasonState) {
          setCaptureVisualNow(tickNow)
        }

        return nextSeasonState
      })
    }, GAME_CLOCK_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    savePlayerState(playerState)
  }, [playerState])

  useEffect(() => {
    saveSeasonState(seasonState)
  }, [seasonState])

  useEffect(() => {
    if (!statusMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage(null)
    }, 2400)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [statusMessage])

  const resolvedPlayerState = useMemo(
    () => regeneratePlayerActionPoints(playerState, now),
    [now, playerState],
  )
  const resolvedSeasonState = useMemo(
    () => ensureActiveSeasonState(seasonState, now),
    [now, seasonState],
  )
  const seasonWindow = useMemo(() => getSeasonWindow(now), [now])
  const seasonTimeRemaining = useMemo(
    () => getSeasonTimeRemaining(resolvedSeasonState, now),
    [now, resolvedSeasonState],
  )
  const nextActionPointIn = useMemo(
    () => getTimeUntilNextActionPoint(playerState, now),
    [now, playerState],
  )
  const legendGroups = useMemo(
    () => buildRegionControlLegend(resolvedSeasonState),
    [resolvedSeasonState],
  )
  const controlCounts = useMemo(
    () => getRegionControlCountsFromSeason(resolvedSeasonState),
    [resolvedSeasonState],
  )
  const nextRecentCaptureExpiryAt = useMemo(
    () => getNextRecentCaptureExpiryAt(resolvedSeasonState, captureVisualNow),
    [captureVisualNow, resolvedSeasonState],
  )
  const townVisualStates = useMemo(
    () => buildTownVisualStates(resolvedSeasonState, townNeighbors, captureVisualNow),
    [captureVisualNow, resolvedSeasonState, townNeighbors],
  )

  const contestedTownCount = useMemo(
    () =>
      Object.values(resolvedSeasonState.towns).filter((town) => town.isContested).length,
    [resolvedSeasonState],
  )
  const capturedTownCount = useMemo(
    () => Object.values(townVisualStates).filter((town) => town.isCaptureProtected).length,
    [townVisualStates],
  )

  useEffect(() => {
    if (nextRecentCaptureExpiryAt === null) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCaptureVisualNow(Date.now())
    }, Math.max(0, nextRecentCaptureExpiryAt - Date.now()) + 16)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [nextRecentCaptureExpiryAt])

  const performAction = (action: PlayerAction) => {
    const actionNow = Date.now()
    const refreshedPlayerState = regeneratePlayerActionPoints(playerState, actionNow)
    const refreshedSeasonState = ensureActiveSeasonState(seasonState, actionNow)

    const nextPlayerState = spendPlayerActionPoints(
      refreshedPlayerState,
      actionNow,
      PLAYER_ACTION_COST,
    )

    if (!nextPlayerState) {
      setPlayerState(refreshedPlayerState)
      setStatusMessage(`No action points. +1 in ${formatDurationShort(nextActionPointIn)}.`)
      return
    }

    const actionResult = applyAction({
      action,
      now: actionNow,
      season: refreshedSeasonState,
      townNeighbors,
    })

    if (!actionResult.ok) {
      setPlayerState(refreshedPlayerState)
      setStatusMessage(actionResult.error ?? "Action unavailable.")
      return
    }

    setPlayerState(nextPlayerState)
    setSeasonState(actionResult.season)
    setNow(actionNow)
    setCaptureVisualNow(actionNow)
    setSpendFeedbackKey((currentKey) => (currentKey ?? 0) + 1)
    setStatusMessage(null)
  }

  const getTownBattleState = (townName: TownName) => resolvedSeasonState.towns[townName]

  const getTownContext = (townName: TownName) => {
    const town = getTownBattleState(townName)
    if (!town) {
      return null
    }

    return {
      captureProtectionRemaining: getTownCaptureProtectionRemaining(town, now),
      isCaptureProtected: getTownCaptureProtectionRemaining(town, now) > 0,
      neighboringTowns: townNeighbors[townName] ?? [],
      town,
      validInvadingRegions: getValidInvadingRegions({
        season: resolvedSeasonState,
        townName,
        townNeighbors,
      }),
    }
  }

  return {
    actionPoints: resolvedPlayerState.actionPoints,
    capturedTownCount,
    contestedTownCount,
    controlCounts,
    getTownBattleState,
    getTownContext,
    legendGroups,
    nextActionPointIn,
    onDefend: (townName: TownName) =>
      performAction({ townName, type: "defend" }),
    onDismissSpendFeedback: () => setSpendFeedbackKey(null),
    onInvade: (townName: TownName, invadingRegion: RegionName) =>
      performAction({ invadingRegion, townName, type: "invade" }),
    season: resolvedSeasonState,
    seasonLabel: `Season ${seasonWindow.seasonNumber}`,
    seasonTimeRemaining,
    spendFeedbackKey,
    statusMessage,
    townVisualStates,
  }
}

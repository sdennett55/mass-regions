import type { RegionName } from "../data/massRegions"

export type { RegionName }

export type TownName = string

export interface TownBattleState {
  townName: TownName
  currentRegion: RegionName
  baselineRegion: RegionName
  contestingRegion: RegionName | null
  captureProgress: number
  isContested: boolean
  lastCapturedAt?: number
}

export interface SeasonState {
  seasonId: string
  startedAt: number
  endsAt: number
  towns: Record<TownName, TownBattleState>
}

export interface PlayerState {
  actionPoints: number
  lastRegeneratedAt: number
}

export interface TownBounds {
  centerX: number
  centerY: number
  height: number
  maxX: number
  maxY: number
  minX: number
  minY: number
  width: number
}

export interface TownAdjacencyShape {
  bounds: TownBounds
  pathElement: SVGPathElement
}

export type TownNeighbors = Record<TownName, TownName[]>

export type RegionalClaims = Partial<Record<TownName, RegionName[]>>

export type PlayerAction =
  | {
      townName: TownName
      type: "defend"
    }
  | {
      invadingRegion: RegionName
      townName: TownName
      type: "invade"
    }

export interface ActionResult {
  error?: string
  ok: boolean
  season: SeasonState
  town?: TownBattleState
}

export interface TownVisualState {
  currentRegion: RegionName
  contestingRegion: RegionName | null
  captureProgress: number
  isCaptureProtected: boolean
  isContested: boolean
  isFrontline: boolean
  isRecentlyCaptured: boolean
}

export interface RegionControlGroup {
  color: string
  region: RegionName
  townCount: number
  towns: string[]
}

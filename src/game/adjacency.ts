import { getCanonicalTownId, getRegionForTownId } from '../data/massRegions'

import {
  NEIGHBOR_GAP_TOLERANCE,
  NEIGHBOR_MIN_SHARED_EDGE,
} from './constants'
import { manualTownNeighbors } from './manualTownNeighbors'
import type {
  TownAdjacencyShape,
  TownBounds,
  TownName,
  TownNeighbors,
} from './types'

function createTownBounds(minX: number, minY: number, maxX: number, maxY: number): TownBounds {
  const width = maxX - minX
  const height = maxY - minY

  return {
    centerX: minX + width / 2,
    centerY: minY + height / 2,
    height,
    maxX,
    maxY,
    minX,
    minY,
    width,
  }
}

function getTownBoundsArea(bounds: TownBounds) {
  return bounds.width * bounds.height
}

function buildTownShape(pathElement: SVGPathElement, bounds: DOMRect): TownAdjacencyShape {
  return {
    bounds: createTownBounds(
      bounds.x,
      bounds.y,
      bounds.x + bounds.width,
      bounds.y + bounds.height,
    ),
    pathElement,
  }
}

function areTownsAdjacent(a: TownAdjacencyShape, b: TownAdjacencyShape) {
  const horizontalGap = Math.max(
    0,
    Math.max(a.bounds.minX - b.bounds.maxX, b.bounds.minX - a.bounds.maxX),
  )
  const verticalGap = Math.max(
    0,
    Math.max(a.bounds.minY - b.bounds.maxY, b.bounds.minY - a.bounds.maxY),
  )
  const overlapX =
    Math.min(a.bounds.maxX, b.bounds.maxX) - Math.max(a.bounds.minX, b.bounds.minX)
  const overlapY =
    Math.min(a.bounds.maxY, b.bounds.maxY) - Math.max(a.bounds.minY, b.bounds.minY)

  const sharesVerticalEdge =
    horizontalGap <= NEIGHBOR_GAP_TOLERANCE && overlapY >= NEIGHBOR_MIN_SHARED_EDGE
  const sharesHorizontalEdge =
    verticalGap <= NEIGHBOR_GAP_TOLERANCE && overlapX >= NEIGHBOR_MIN_SHARED_EDGE

  return sharesVerticalEdge || sharesHorizontalEdge
}

function buildNormalizedManualTownNeighbors() {
  const normalizedNeighbors = new Map<TownName, Set<TownName>>()

  for (const [rawTownName, rawNeighbors] of Object.entries(manualTownNeighbors)) {
    const townName = getCanonicalTownId(rawTownName)
    if (!getRegionForTownId(townName)) {
      continue
    }

    const neighbors = normalizedNeighbors.get(townName) ?? new Set<TownName>()

    for (const rawNeighborTownName of rawNeighbors) {
      const neighborTownName = getCanonicalTownId(rawNeighborTownName)

      if (!getRegionForTownId(neighborTownName) || neighborTownName === townName) {
        continue
      }

      neighbors.add(neighborTownName)
    }

    normalizedNeighbors.set(townName, neighbors)
  }

  for (const [townName, neighbors] of normalizedNeighbors) {
    for (const neighborTownName of neighbors) {
      if (!normalizedNeighbors.has(neighborTownName)) {
        continue
      }

      normalizedNeighbors.get(neighborTownName)?.add(townName)
    }
  }

  return normalizedNeighbors
}

const normalizedManualTownNeighbors = buildNormalizedManualTownNeighbors()

function cloneNeighbors(neighborsByTown: TownNeighbors) {
  return Object.fromEntries(
    Object.entries(neighborsByTown).map(([townName, neighbors]) => [
      townName,
      new Set(neighbors),
    ]),
  ) as Record<TownName, Set<TownName>>
}

function sortTownNeighbors(
  neighbors: Set<TownName>,
  originBounds: TownBounds,
  shapesByTown: Record<TownName, TownAdjacencyShape>,
) {
  return [...neighbors].sort((townA, townB) => {
    const a = shapesByTown[townA]?.bounds
    const b = shapesByTown[townB]?.bounds

    if (!a || !b) {
      return townA.localeCompare(townB)
    }

    const distanceA = Math.hypot(a.centerX - originBounds.centerX, a.centerY - originBounds.centerY)
    const distanceB = Math.hypot(b.centerX - originBounds.centerX, b.centerY - originBounds.centerY)

    return distanceA - distanceB || townA.localeCompare(townB)
  })
}

function applyManualTownNeighbors(
  inferredNeighbors: TownNeighbors,
  shapesByTown: Record<TownName, TownAdjacencyShape>,
) {
  const mergedNeighbors = cloneNeighbors(inferredNeighbors)
  const manuallyDefinedTowns = new Set(normalizedManualTownNeighbors.keys())

  for (const [townName, manualNeighbors] of normalizedManualTownNeighbors) {
    mergedNeighbors[townName] = new Set(
      [...manualNeighbors].filter((neighborTownName) => neighborTownName in mergedNeighbors),
    )
  }

  for (const townName of Object.keys(mergedNeighbors) as TownName[]) {
    if (manuallyDefinedTowns.has(townName)) {
      continue
    }

    for (const [manualTownName, manualNeighbors] of normalizedManualTownNeighbors) {
      if (manualNeighbors.has(townName)) {
        mergedNeighbors[townName].add(manualTownName)
      } else {
        mergedNeighbors[townName].delete(manualTownName)
      }
    }
  }

  return Object.fromEntries(
    Object.entries(mergedNeighbors).map(([townName, neighbors]) => [
      townName,
      sortTownNeighbors(neighbors, shapesByTown[townName].bounds, shapesByTown),
    ]),
  ) as TownNeighbors
}

export function collectTownShapesFromSvg(svg: SVGSVGElement) {
  const shapesByTown: Record<TownName, TownAdjacencyShape> = {}
  const townPaths = svg.querySelectorAll<SVGPathElement>('path[id]')

  for (const pathElement of townPaths) {
    if (!getRegionForTownId(pathElement.id)) {
      continue
    }

    const townName = getCanonicalTownId(pathElement.id)
    const nextBounds = pathElement.getBBox()

    if (!Number.isFinite(nextBounds.width) || !Number.isFinite(nextBounds.height)) {
      continue
    }

    const nextTownShape = buildTownShape(pathElement, nextBounds)
    const currentTownShape = shapesByTown[townName]

    if (
      !currentTownShape ||
      getTownBoundsArea(nextTownShape.bounds) > getTownBoundsArea(currentTownShape.bounds)
    ) {
      shapesByTown[townName] = nextTownShape
    }
  }

  return shapesByTown
}

export function buildTownNeighbors(shapesByTown: Record<TownName, TownAdjacencyShape>): TownNeighbors {
  const townEntries = Object.entries(shapesByTown)
  const neighborsByTown = Object.fromEntries(
    townEntries.map(([townName]) => [townName, new Set<TownName>()]),
  ) as Record<TownName, Set<TownName>>

  for (let index = 0; index < townEntries.length; index += 1) {
    const [townName, townShape] = townEntries[index]

    for (let compareIndex = index + 1; compareIndex < townEntries.length; compareIndex += 1) {
      const [otherTownName, otherTownShape] = townEntries[compareIndex]

      if (!areTownsAdjacent(townShape, otherTownShape)) {
        continue
      }

      neighborsByTown[townName].add(otherTownName)
      neighborsByTown[otherTownName].add(townName)
    }
  }

  const inferredNeighbors = Object.fromEntries(
    Object.entries(neighborsByTown).map(([townName, neighbors]) => {
      return [townName, sortTownNeighbors(neighbors, shapesByTown[townName].bounds, shapesByTown)]
    }),
  ) as TownNeighbors

  return applyManualTownNeighbors(inferredNeighbors, shapesByTown)
}

import { manualTownNeighbors } from "./manualTownNeighbors";
import type { TownName, TownNeighbors } from "./types";
import { baselineTownRegions } from "./world";

type ReadonlyTownNeighbors = Partial<Record<TownName, readonly TownName[]>>;

export function normalizeTownNeighbors(
  neighbors: ReadonlyTownNeighbors,
): TownNeighbors {
  const normalizedNeighbors = Object.fromEntries(
    Object.keys(baselineTownRegions).map((townName) => [townName, []]),
  ) as TownNeighbors;

  for (const [townName, neighborList] of Object.entries(neighbors)) {
    normalizedNeighbors[townName] = [...new Set(neighborList)];
  }

  for (const [townName, neighborList] of Object.entries(normalizedNeighbors)) {
    for (const neighborTown of neighborList) {
      const existingNeighbors = normalizedNeighbors[neighborTown] ?? [];
      if (!existingNeighbors.includes(townName)) {
        normalizedNeighbors[neighborTown] = [...existingNeighbors, townName];
      }
    }
  }

  return normalizedNeighbors;
}

// Finish the hardcoded statewide adjacency list in manualTownNeighbors.ts.
// Both the server and the frontend consume the normalized result below.
export const sharedTownNeighbors = normalizeTownNeighbors(manualTownNeighbors);

import { massTownToRegion, type RegionName } from '../data/massRegions'

import type { RegionalClaims, TownName } from './types'

export const baselineTownRegions = massTownToRegion as Record<TownName, RegionName>

export const regionalClaims: RegionalClaims = {
  ATTLEBORO: ['Greater Boston', 'South Coast'],
  BOURNE: ['South Coast'],
  FALMOUTH: ['South Coast'],
  PLYMOUTH: ['Cape Cod & Islands'],
  TAUNTON: ['South Coast', 'South Shore'],
  WAREHAM: ['Cape Cod & Islands'],
}

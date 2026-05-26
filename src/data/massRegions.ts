export const regionOrder = [
  "Cape Cod & Islands",
  "South Coast",
  "South Shore",
  "Southeastern Massachusetts",
  "Greater Boston",
  "MetroWest",
  "North Shore",
  "Merrimack Valley",
  "Central Massachusetts",
  "North Central Massachusetts",
  "Pioneer Valley",
  "Berkshires",
] as const;

export type RegionName = (typeof regionOrder)[number];
export type RegionLegendGroup = {
  color: string;
  region: RegionName;
  townCount: number;
  towns: string[];
};

export const massTownToRegion: Record<string, RegionName> = {
  BARNSTABLE: "Cape Cod & Islands",
  BOURNE: "Cape Cod & Islands",
  BREWSTER: "Cape Cod & Islands",
  CHATHAM: "Cape Cod & Islands",
  DENNIS: "Cape Cod & Islands",
  EASTHAM: "Cape Cod & Islands",
  FALMOUTH: "Cape Cod & Islands",
  HARWICH: "Cape Cod & Islands",
  MASHPEE: "Cape Cod & Islands",
  ORLEANS: "Cape Cod & Islands",
  PROVINCETOWN: "Cape Cod & Islands",
  SANDWICH: "Cape Cod & Islands",
  TRURO: "Cape Cod & Islands",
  WELLFLEET: "Cape Cod & Islands",
  YARMOUTH: "Cape Cod & Islands",

  AQUINNAH: "Cape Cod & Islands",
  CHILMARK: "Cape Cod & Islands",
  EDGARTOWN: "Cape Cod & Islands",
  GOSNOLD: "Cape Cod & Islands",
  NANTUCKET: "Cape Cod & Islands",
  OAK_BLUFFS: "Cape Cod & Islands",
  TISBURY: "Cape Cod & Islands",
  WEST_TISBURY: "Cape Cod & Islands",

  ACUSHNET: "South Coast",
  DARTMOUTH: "South Coast",
  FAIRHAVEN: "South Coast",
  FALL_RIVER: "South Coast",
  FREETOWN: "South Coast",
  MARION: "South Coast",
  MATTAPOISETT: "South Coast",
  NEW_BEDFORD: "South Coast",
  ROCHESTER: "South Coast",
  SOMERSET: "South Coast",
  SWANSEA: "South Coast",
  WAREHAM: "South Coast",
  WESTPORT: "South Coast",

  ABINGTON: "South Shore",
  BRAINTREE: "South Shore",
  BRIDGEWATER: "South Shore",
  CARVER: "South Shore",
  COHASSET: "South Shore",
  DUXBURY: "South Shore",
  EAST_BRIDGEWATER: "South Shore",
  HALIFAX: "South Shore",
  HANOVER: "South Shore",
  HANSON: "South Shore",
  HINGHAM: "South Shore",
  HOLBROOK: "South Shore",
  HULL: "South Shore",
  KINGSTON: "South Shore",
  LAKEVILLE: "South Shore",
  MARSHFIELD: "South Shore",
  MIDDLEBOROUGH: "South Shore",
  NORWELL: "South Shore",
  PEMBROKE: "South Shore",
  PLYMOUTH: "South Shore",
  PLYMPTON: "South Shore",
  QUINCY: "South Shore",
  ROCKLAND: "South Shore",
  SCITUATE: "South Shore",
  WEST_BRIDGEWATER: "South Shore",
  WEYMOUTH: "South Shore",
  WHITMAN: "South Shore",

  ATTLEBORO: "Southeastern Massachusetts",
  AVON: "Greater Boston",
  BERKLEY: "Southeastern Massachusetts",
  BROCKTON: "Southeastern Massachusetts",
  DIGHTON: "Southeastern Massachusetts",
  EASTON: "Southeastern Massachusetts",
  FOXBOROUGH: "Greater Boston",
  MANSFIELD: "Southeastern Massachusetts",
  NORTH_ATTLEBOROUGH: "Southeastern Massachusetts",
  NORTON: "Southeastern Massachusetts",
  PLAINVILLE: "Greater Boston",
  RAYNHAM: "Southeastern Massachusetts",
  REHOBOTH: "Southeastern Massachusetts",
  SEEKONK: "Southeastern Massachusetts",
  STOUGHTON: "Greater Boston",
  TAUNTON: "Southeastern Massachusetts",

  ARLINGTON: "Greater Boston",
  BELMONT: "Greater Boston",
  BOSTON: "Greater Boston",
  BROOKLINE: "Greater Boston",
  CAMBRIDGE: "Greater Boston",
  CHELSEA: "Greater Boston",
  DEDHAM: "Greater Boston",
  EVERETT: "Greater Boston",
  MALDEN: "Greater Boston",
  MEDFORD: "Greater Boston",
  MELROSE: "Greater Boston",
  MILTON: "Greater Boston",
  NAHANT: "Greater Boston",
  NEWTON: "Greater Boston",
  RANDOLPH: "Greater Boston",
  REVERE: "Greater Boston",
  SOMERVILLE: "Greater Boston",
  STONEHAM: "Greater Boston",
  WALTHAM: "Greater Boston",
  WATERTOWN: "Greater Boston",
  WINCHESTER: "Greater Boston",
  WINTHROP: "Greater Boston",

  ACTON: "MetroWest",
  ASHLAND: "MetroWest",
  BEDFORD: "MetroWest",
  BOXBOROUGH: "MetroWest",
  CARLISLE: "MetroWest",
  CONCORD: "MetroWest",
  DOVER: "MetroWest",
  FRAMINGHAM: "MetroWest",
  HOLLISTON: "MetroWest",
  HOPKINTON: "MetroWest",
  HUDSON: "MetroWest",
  LEXINGTON: "MetroWest",
  LINCOLN: "MetroWest",
  MARLBOROUGH: "MetroWest",
  MAYNARD: "MetroWest",
  NATICK: "MetroWest",
  NEEDHAM: "MetroWest",
  SHERBORN: "MetroWest",
  STOW: "MetroWest",
  SUDBURY: "MetroWest",
  WELLESLEY: "MetroWest",
  WESTON: "MetroWest",
  WAYLAND: "MetroWest",
  WESTWOOD: "MetroWest",

  BELLINGHAM: "MetroWest",
  BLACKSTONE: "Central Massachusetts",
  CANTON: "Greater Boston",
  DOUGLAS: "Central Massachusetts",
  FRANKLIN: "MetroWest",
  HOPEDALE: "MetroWest",
  MEDFIELD: "MetroWest",
  MEDWAY: "MetroWest",
  MENDON: "Central Massachusetts",
  MILFORD: "MetroWest",
  MILLIS: "MetroWest",
  MILLVILLE: "Central Massachusetts",
  NORFOLK: "Greater Boston",
  NORWOOD: "Greater Boston",
  SHARON: "Greater Boston",
  UPTON: "Central Massachusetts",
  UXBRIDGE: "Central Massachusetts",
  WALPOLE: "Greater Boston",
  WRENTHAM: "Greater Boston",

  BEVERLY: "North Shore",
  DANVERS: "North Shore",
  ESSEX: "North Shore",
  GLOUCESTER: "North Shore",
  HAMILTON: "North Shore",
  IPSWICH: "North Shore",
  LYNN: "North Shore",
  LYNNFIELD: "North Shore",
  MANCHESTER_BY_THE_SEA: "North Shore",
  MARBLEHEAD: "North Shore",
  MIDDLETON: "North Shore",
  PEABODY: "North Shore",
  ROCKPORT: "North Shore",
  ROWLEY: "North Shore",
  SALEM: "North Shore",
  SAUGUS: "North Shore",
  SWAMPSCOTT: "North Shore",
  TOPSFIELD: "North Shore",
  WENHAM: "North Shore",

  AMESBURY: "Merrimack Valley",
  ANDOVER: "Merrimack Valley",
  BOXFORD: "Merrimack Valley",
  GEORGETOWN: "Merrimack Valley",
  GROVELAND: "Merrimack Valley",
  HAVERHILL: "Merrimack Valley",
  LAWRENCE: "Merrimack Valley",
  MERRIMAC: "Merrimack Valley",
  METHUEN: "Merrimack Valley",
  NEWBURY: "Merrimack Valley",
  NEWBURYPORT: "Merrimack Valley",
  NORTH_ANDOVER: "Merrimack Valley",
  SALISBURY: "Merrimack Valley",
  WEST_NEWBURY: "Merrimack Valley",

  BILLERICA: "Merrimack Valley",
  BURLINGTON: "Merrimack Valley",
  CHELMSFORD: "Merrimack Valley",
  DRACUT: "Merrimack Valley",
  DUNSTABLE: "Merrimack Valley",
  LOWELL: "Merrimack Valley",
  NORTH_READING: "Merrimack Valley",
  READING: "Merrimack Valley",
  TEWKSBURY: "Merrimack Valley",
  TYNGSBOROUGH: "Merrimack Valley",
  WAKEFIELD: "Merrimack Valley",
  WESTFORD: "Merrimack Valley",
  WILMINGTON: "Merrimack Valley",
  WOBURN: "Merrimack Valley",

  AUBURN: "Central Massachusetts",
  BARRE: "Central Massachusetts",
  BERLIN: "Central Massachusetts",
  BOLTON: "Central Massachusetts",
  BOYLSTON: "Central Massachusetts",
  BROOKFIELD: "Central Massachusetts",
  CHARLTON: "Central Massachusetts",
  CLINTON: "Central Massachusetts",
  DUDLEY: "Central Massachusetts",
  EAST_BROOKFIELD: "Central Massachusetts",
  GRAFTON: "Central Massachusetts",
  HARDWICK: "Central Massachusetts",
  HOLDEN: "Central Massachusetts",
  HUBBARDSTON: "Central Massachusetts",
  LANCASTER: "Central Massachusetts",
  LEICESTER: "Central Massachusetts",
  MILLBURY: "Central Massachusetts",
  NEW_BRAINTREE: "Central Massachusetts",
  NORTHBOROUGH: "MetroWest",
  NORTH_BROOKFIELD: "Central Massachusetts",
  NORTHBRIDGE: "Central Massachusetts",
  OAKHAM: "Central Massachusetts",
  OXFORD: "Central Massachusetts",
  PAXTON: "Central Massachusetts",
  PRINCETON: "Central Massachusetts",
  RUTLAND: "Central Massachusetts",
  SHREWSBURY: "Central Massachusetts",
  SOUTHBOROUGH: "MetroWest",
  SOUTHBRIDGE: "Central Massachusetts",
  SPENCER: "Central Massachusetts",
  STERLING: "Central Massachusetts",
  STURBRIDGE: "Central Massachusetts",
  SUTTON: "Central Massachusetts",
  WARREN: "Central Massachusetts",
  WEBSTER: "Central Massachusetts",
  WEST_BOYLSTON: "Central Massachusetts",
  WEST_BROOKFIELD: "Central Massachusetts",
  WESTBOROUGH: "MetroWest",
  WORCESTER: "Central Massachusetts",

  ASHBURNHAM: "North Central Massachusetts",
  ASHBY: "North Central Massachusetts",
  ATHOL: "North Central Massachusetts",
  AYER: "North Central Massachusetts",
  FITCHBURG: "North Central Massachusetts",
  GARDNER: "North Central Massachusetts",
  GROTON: "North Central Massachusetts",
  HARVARD: "North Central Massachusetts",
  LEOMINSTER: "North Central Massachusetts",
  LITTLETON: "North Central Massachusetts",
  LUNENBURG: "North Central Massachusetts",
  ORANGE: "North Central Massachusetts",
  PEPPERELL: "North Central Massachusetts",
  PETERSHAM: "North Central Massachusetts",
  PHILLIPSTON: "North Central Massachusetts",
  ROYALSTON: "North Central Massachusetts",
  SHIRLEY: "North Central Massachusetts",
  TEMPLETON: "North Central Massachusetts",
  TOWNSEND: "North Central Massachusetts",
  WESTMINSTER: "North Central Massachusetts",
  WINCHENDON: "North Central Massachusetts",

  AGAWAM: "Pioneer Valley",
  AMHERST: "Pioneer Valley",
  BELCHERTOWN: "Pioneer Valley",
  BLANDFORD: "Pioneer Valley",
  BRIMFIELD: "Pioneer Valley",
  CHESTER: "Pioneer Valley",
  CHESTERFIELD: "Pioneer Valley",
  CHICOPEE: "Pioneer Valley",
  EASTHAMPTON: "Pioneer Valley",
  EAST_LONGMEADOW: "Pioneer Valley",
  GRANBY: "Pioneer Valley",
  GRANVILLE: "Pioneer Valley",
  HADLEY: "Pioneer Valley",
  HAMPDEN: "Pioneer Valley",
  HATFIELD: "Pioneer Valley",
  HOLLAND: "Pioneer Valley",
  HOLYOKE: "Pioneer Valley",
  HUNTINGTON: "Pioneer Valley",
  LONGMEADOW: "Pioneer Valley",
  LUDLOW: "Pioneer Valley",
  MONSON: "Pioneer Valley",
  MONTGOMERY: "Pioneer Valley",
  NORTHAMPTON: "Pioneer Valley",
  PALMER: "Pioneer Valley",
  PELHAM: "Pioneer Valley",
  RUSSELL: "Pioneer Valley",
  SOUTHAMPTON: "Pioneer Valley",
  SOUTH_HADLEY: "Pioneer Valley",
  SOUTHWICK: "Pioneer Valley",
  SPRINGFIELD: "Pioneer Valley",
  TOLLAND: "Pioneer Valley",
  WALES: "Pioneer Valley",
  WARE: "Pioneer Valley",
  WESTFIELD: "Pioneer Valley",
  WESTHAMPTON: "Pioneer Valley",
  WEST_SPRINGFIELD: "Pioneer Valley",
  WILBRAHAM: "Pioneer Valley",
  WILLIAMSBURG: "Pioneer Valley",
  WORTHINGTON: "Pioneer Valley",

  ASHFIELD: "Pioneer Valley",
  BERNARDSTON: "Pioneer Valley",
  BUCKLAND: "Pioneer Valley",
  CHARLEMONT: "Pioneer Valley",
  COLRAIN: "Pioneer Valley",
  CONWAY: "Pioneer Valley",
  CUMMINGTON: "Pioneer Valley",
  DEERFIELD: "Pioneer Valley",
  ERVING: "Pioneer Valley",
  GILL: "Pioneer Valley",
  GOSHEN: "Pioneer Valley",
  GREENFIELD: "Pioneer Valley",
  HAWLEY: "Pioneer Valley",
  HEATH: "Pioneer Valley",
  LEVERETT: "Pioneer Valley",
  LEYDEN: "Pioneer Valley",
  MONTAGUE: "Pioneer Valley",
  MONROE: "Berkshires",
  NEW_SALEM: "Pioneer Valley",
  NORTHFIELD: "Pioneer Valley",
  PLAINFIELD: "Pioneer Valley",
  ROWE: "Pioneer Valley",
  SHELBURNE: "Pioneer Valley",
  SHUTESBURY: "Pioneer Valley",
  SUNDERLAND: "Pioneer Valley",
  WARWICK: "Pioneer Valley",
  WENDELL: "Pioneer Valley",
  WHATELY: "Pioneer Valley",
  WINDSOR: "Berkshires",

  ADAMS: "Berkshires",
  ALFORD: "Berkshires",
  BECKET: "Berkshires",
  CHESHIRE: "Berkshires",
  CLARKSBURG: "Berkshires",
  DALTON: "Berkshires",
  EGREMONT: "Berkshires",
  FLORIDA: "Berkshires",
  GREAT_BARRINGTON: "Berkshires",
  HANCOCK: "Berkshires",
  HINSDALE: "Berkshires",
  LANESBOROUGH: "Berkshires",
  LEE: "Berkshires",
  LENOX: "Berkshires",
  MIDDLEFIELD: "Berkshires",
  MONTEREY: "Berkshires",
  MOUNT_WASHINGTON: "Berkshires",
  NEW_ASHFORD: "Berkshires",
  NEW_MARLBOROUGH: "Berkshires",
  NORTH_ADAMS: "Berkshires",
  OTIS: "Berkshires",
  PERU: "Berkshires",
  PITTSFIELD: "Berkshires",
  RICHMOND: "Berkshires",
  SANDISFIELD: "Berkshires",
  SAVOY: "Berkshires",
  SHEFFIELD: "Berkshires",
  STOCKBRIDGE: "Berkshires",
  TYRINGHAM: "Berkshires",
  WASHINGTON: "Berkshires",
  WEST_STOCKBRIDGE: "Berkshires",
  WILLIAMSTOWN: "Berkshires",
};

export const regionColors: Record<RegionName, string> = {
  "Cape Cod & Islands": "#fbbf24",
  "South Coast": "#f87171",
  "South Shore": "#f472b6",
  "Southeastern Massachusetts": "#c084fc",
  "Greater Boston": "#60a5fa",
  MetroWest: "#38bdf8",
  "North Shore": "#4ade80",
  "Merrimack Valley": "#a3e635",
  "Central Massachusetts": "#f59e0b",
  "North Central Massachusetts": "#fdba74",
  "Pioneer Valley": "#34d399",
  Berkshires: "#d6b27d",
};

const normalizedAliasMap: Record<string, string> = {
  HINSADLE: "HINSDALE",
  MANCHESTER: "MANCHESTER_BY_THE_SEA",
  MT_WASHINGTON: "MOUNT_WASHINGTON",
  MTWASHINGTON: "MOUNT_WASHINGTON",
};

const townDisplayNameOverrides: Record<string, string> = {
  MANCHESTER_BY_THE_SEA: "Manchester-by-the-Sea",
};

const compactTownToRegion = new Map(
  Object.entries(massTownToRegion).map(([town, region]) => [
    town.replace(/_/g, ""),
    region,
  ]),
);

function countTownsByRegion<Region extends string>(
  townToRegion: Record<string, Region>,
  regions: readonly Region[],
) {
  return Object.values(townToRegion).reduce<Record<Region, number>>(
    (counts, region) => {
      counts[region] += 1;
      return counts;
    },
    Object.fromEntries(regions.map((region) => [region, 0])) as Record<
      Region,
      number
    >,
  );
}

const regionTownCounts = countTownsByRegion(massTownToRegion, regionOrder);

export const regionLegend = regionOrder.map((region) => ({
  region,
  color: regionColors[region],
  townCount: regionTownCounts[region],
}));

export const mappedTownCount = Object.keys(massTownToRegion).length;

export function normalizeTownId(rawTownId: string) {
  return rawTownId
    .trim()
    .toUpperCase()
    .replace(/\d+$/, "")
    .replace(/[.'’]/g, "")
    .replace(/&/g, "AND")
    .replace(/[\s-]+/g, "_");
}

export function getCanonicalTownId(rawTownId: string) {
  const normalizedTownId = normalizeTownId(rawTownId);
  return normalizedAliasMap[normalizedTownId] ?? normalizedTownId;
}

export function getRegionColor(region: RegionName) {
  return regionColors[region];
}

export function getRegionTownCount(region: RegionName) {
  const legendGroup = getLegendGroups().find((group) => group.region === region);

  return legendGroup?.townCount ?? 0;
}

export function getRegionForTownId(rawTownId: string): RegionName | undefined {
  const canonicalTownId = getCanonicalTownId(rawTownId);

  return (
    massTownToRegion[canonicalTownId] ??
    compactTownToRegion.get(canonicalTownId.replace(/_/g, ""))
  );
}

export function formatTownLabel(rawTownId: string) {
  const canonicalTownId = getCanonicalTownId(rawTownId);

  if (townDisplayNameOverrides[canonicalTownId]) {
    return townDisplayNameOverrides[canonicalTownId];
  }

  return canonicalTownId
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildLegendGroups(): RegionLegendGroup[] {
  const seenTowns = new Set<string>();
  const townsByRegion = new Map<RegionName, string[]>();

  for (const [rawTownId, region] of Object.entries(massTownToRegion)) {
    const canonicalTownId = getCanonicalTownId(rawTownId);

    if (seenTowns.has(canonicalTownId)) {
      continue;
    }

    seenTowns.add(canonicalTownId);

    const towns = townsByRegion.get(region) ?? [];
    towns.push(formatTownLabel(canonicalTownId));
    townsByRegion.set(region, towns);
  }

  return regionOrder.map((region) => {
    const towns = (townsByRegion.get(region) ?? []).sort((townA, townB) =>
      townA.localeCompare(townB),
    );

    return {
      color: getRegionColor(region),
      region,
      townCount: towns.length,
      towns,
    };
  });
}

const standardLegendGroups = buildLegendGroups();

export function getLegendGroups() {
  return standardLegendGroups;
}

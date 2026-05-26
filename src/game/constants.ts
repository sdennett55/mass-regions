export const SEASON_DURATION_MS = 7 * 24 * 60 * 60 * 1000
export const SEASON_EPOCH_MS = Date.UTC(2026, 4, 25, 0, 0, 0, 0)

export const PLAYER_MAX_ACTION_POINTS = 20
export const PLAYER_ACTION_REGEN_INTERVAL_MS = 10 * 60 * 1000
export const PLAYER_ACTION_COST = 1

export const CAPTURE_POINTS_TO_CAPTURE = 5
export const INVADE_PROGRESS_AMOUNT = 1
export const DEFEND_PROGRESS_AMOUNT = 1

export const CAPTURE_PROTECTION_WINDOW_MS = 10 * 60 * 1000
export const RECENT_CAPTURE_WINDOW_MS = 6 * 60 * 60 * 1000

export const GAME_CLOCK_INTERVAL_MS = 5 * 1000

export const NEIGHBOR_GAP_TOLERANCE = 0.75
export const NEIGHBOR_MIN_SHARED_EDGE = 5

export const PLAYER_ID_STORAGE_KEY = "mass-regions:territory:player-id"
export const PLAYER_STATE_STORAGE_KEY = "mass-regions:territory:player"
export const SEASON_STATE_STORAGE_KEY = "mass-regions:territory:season"

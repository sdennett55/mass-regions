export const SEASON_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const SEASON_EPOCH_MS = Date.UTC(2026, 0, 5, 0, 0, 0, 0);

export const PLAYER_MAX_INFLUENCE_POINTS = 20;
export const PLAYER_REGEN_INTERVAL_MS = 10 * 60 * 1000;
export const PLAYER_ACTION_COST = 1;

export const MAX_STABILITY = 100;
export const MIN_STABILITY = 0;
export const BASELINE_STABILITY = 78;
export const BASELINE_REGION_INFLUENCE = 18;

export const REINFORCE_AMOUNT = 6;
export const REINFORCE_STABILITY_GAIN = 7;
export const INVADE_AMOUNT = 8;
export const INVADE_STABILITY_DAMAGE = 12;
export const DESTABILIZE_AMOUNT = 16;

export const FLIP_LEAD_REQUIRED = 14;
export const STABILITY_FLIP_THRESHOLD = 38;
export const CONTESTED_STABILITY_THRESHOLD = 56;
export const CONTESTED_LEAD_THRESHOLD = 12;
export const LOW_STABILITY_THRESHOLD = 32;
export const CAPTURE_STABILITY_RESET = 36;
export const CAPTURE_INFLUENCE_DECAY_FACTOR = 0.58;
export const CAPTURE_PROTECTION_WINDOW_MS = 60 * 60 * 1000;
export const RECENT_CAPTURE_WINDOW_MS = 6 * 60 * 60 * 1000;

export const GAME_CLOCK_INTERVAL_MS = 5 * 1000;

export const NEIGHBOR_GAP_TOLERANCE = 0.75;
export const NEIGHBOR_MIN_SHARED_EDGE = 5;

export const PLAYER_ID_STORAGE_KEY = "mass-regions:territory:player-id";
export const PLAYER_STATE_STORAGE_KEY = "mass-regions:territory:player";
export const SEASON_STATE_STORAGE_KEY = "mass-regions:territory:season";

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  PlayerState,
  RegionName,
  SeasonState,
  TownName,
} from "../../src/game/types.ts";

export type FingerprintRecord = {
  issuedAtTimestamps: number[];
  lastIssuedSessionId: string | null;
};

export type IpBlockRecord = {
  blockedUntil: number | null;
  createdAt: number;
  reason: string;
  sessionIds?: string[];
};

export type CaptureHistoryRecord = {
  capturedAt: number;
  id: number;
  ip: string;
  newRegion: RegionName;
  previousLastCapturedAt: number | null;
  previousRegion: RegionName;
  revertedAt: number | null;
  seasonId: string;
  sessionId: string;
  townName: TownName;
};

export type PersistedIpBlock = {
  ip: string;
  record: IpBlockRecord & {
    sessionIds: string[];
  };
};

function isPlayerState(value: unknown): value is PlayerState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlayerState>;
  return (
    typeof candidate.actionPoints === "number" &&
    typeof candidate.lastRegeneratedAt === "number" &&
    (typeof candidate.maxActionPoints === "number" ||
      typeof candidate.maxActionPoints === "undefined") &&
    (typeof candidate.actionPointRegenIntervalMs === "number" ||
      typeof candidate.actionPointRegenIntervalMs === "undefined")
  );
}

function isFingerprintRecord(value: unknown): value is FingerprintRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<FingerprintRecord>;
  return (
    Array.isArray(candidate.issuedAtTimestamps) &&
    candidate.issuedAtTimestamps.every((timestamp) => typeof timestamp === "number") &&
    (typeof candidate.lastIssuedSessionId === "string" ||
      candidate.lastIssuedSessionId === null)
  );
}

function isIpBlockRecord(value: unknown): value is IpBlockRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<IpBlockRecord>;
  return (
    (typeof candidate.blockedUntil === "number" || candidate.blockedUntil === null) &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.reason === "string" &&
    (Array.isArray(candidate.sessionIds)
      ? candidate.sessionIds.every((sessionId) => typeof sessionId === "string")
      : typeof candidate.sessionIds === "undefined")
  );
}

function parseJsonValue<T>(
  value: string | null | undefined,
  guard: (candidate: unknown) => candidate is T,
) {
  if (!value) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(value) as unknown;
    return guard(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
}

export class ServerPersistence {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS player_states (
        player_id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_fingerprints (
        fingerprint TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ip_blocks (
        ip TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_human_verifications (
        session_id TEXT PRIMARY KEY,
        verified_until INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS capture_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        session_id TEXT NOT NULL,
        season_id TEXT NOT NULL,
        town_name TEXT NOT NULL,
        previous_region TEXT NOT NULL,
        new_region TEXT NOT NULL,
        previous_last_captured_at INTEGER,
        captured_at INTEGER NOT NULL,
        reverted_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_capture_history_ip_season_reverted
      ON capture_history (ip, season_id, reverted_at, captured_at);
    `);
  }

  private loadMetaValue(key: string) {
    const row = this.database
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get(key) as { value: string } | undefined;

    return row?.value ?? null;
  }

  private saveMetaValue(key: string, value: string) {
    this.database
      .prepare(`
        INSERT INTO meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
      .run(key, value);
  }

  loadRevision() {
    const rawValue = this.loadMetaValue("revision");
    const revision = Number(rawValue);
    return Number.isInteger(revision) && revision >= 0 ? revision : 0;
  }

  saveRevision(revision: number) {
    this.saveMetaValue("revision", String(revision));
  }

  loadSeasonState() {
    const rawValue = this.loadMetaValue("season_state");
    return parseJsonValue<SeasonState>(
      rawValue,
      (candidate): candidate is SeasonState => {
        if (!candidate || typeof candidate !== "object") {
          return false;
        }

        const season = candidate as Partial<SeasonState>;
        return (
          typeof season.seasonId === "string" &&
          typeof season.startedAt === "number" &&
          typeof season.endsAt === "number" &&
          !!season.towns &&
          typeof season.towns === "object"
        );
      },
    );
  }

  saveSeasonState(seasonState: SeasonState) {
    this.saveMetaValue("season_state", JSON.stringify(seasonState));
  }

  loadPlayerState(playerId: string) {
    const row = this.database
      .prepare("SELECT value FROM player_states WHERE player_id = ?")
      .get(playerId) as { value: string } | undefined;

    return parseJsonValue<PlayerState>(row?.value, isPlayerState);
  }

  savePlayerState(playerId: string, playerState: PlayerState) {
    this.database
      .prepare(`
        INSERT INTO player_states (player_id, value)
        VALUES (?, ?)
        ON CONFLICT(player_id) DO UPDATE SET value = excluded.value
      `)
      .run(playerId, JSON.stringify(playerState));
  }

  loadFingerprintRecord(fingerprint: string) {
    const row = this.database
      .prepare("SELECT value FROM session_fingerprints WHERE fingerprint = ?")
      .get(fingerprint) as { value: string } | undefined;

    return parseJsonValue<FingerprintRecord>(row?.value, isFingerprintRecord);
  }

  saveFingerprintRecord(fingerprint: string, record: FingerprintRecord) {
    this.database
      .prepare(`
        INSERT INTO session_fingerprints (fingerprint, value)
        VALUES (?, ?)
        ON CONFLICT(fingerprint) DO UPDATE SET value = excluded.value
      `)
      .run(fingerprint, JSON.stringify(record));
  }

  loadIpBlocks(): PersistedIpBlock[] {
    const rows = this.database
      .prepare("SELECT ip, value FROM ip_blocks")
      .all() as Array<{ ip: string; value: string }>;

    return rows
      .map((row) => {
        const record = parseJsonValue<IpBlockRecord>(row.value, isIpBlockRecord);
        if (!record) {
          return null;
        }

        return {
          ip: row.ip,
          record: {
            ...record,
            sessionIds: record.sessionIds ?? [],
          },
        };
      })
      .filter((row): row is PersistedIpBlock => row !== null);
  }

  saveIpBlock(ip: string, record: IpBlockRecord) {
    this.database
      .prepare(`
        INSERT INTO ip_blocks (ip, value)
        VALUES (?, ?)
        ON CONFLICT(ip) DO UPDATE SET value = excluded.value
      `)
      .run(ip, JSON.stringify(record));
  }

  deleteIpBlock(ip: string) {
    this.database.prepare("DELETE FROM ip_blocks WHERE ip = ?").run(ip);
  }

  loadHumanVerification(sessionId: string, now = Date.now()) {
    const row = this.database
      .prepare(`
        SELECT verified_until
        FROM session_human_verifications
        WHERE session_id = ?
      `)
      .get(sessionId) as { verified_until: number } | undefined;

    if (!row) {
      return null;
    }

    if (!Number.isFinite(row.verified_until) || row.verified_until <= now) {
      this.clearHumanVerification(sessionId);
      return null;
    }

    return row.verified_until;
  }

  saveHumanVerification(sessionId: string, verifiedUntil: number, updatedAt: number) {
    this.database
      .prepare(`
        INSERT INTO session_human_verifications (session_id, verified_until, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          verified_until = excluded.verified_until,
          updated_at = excluded.updated_at
      `)
      .run(sessionId, verifiedUntil, updatedAt);
  }

  clearHumanVerification(sessionId: string) {
    this.database
      .prepare("DELETE FROM session_human_verifications WHERE session_id = ?")
      .run(sessionId);
  }

  recordCapture(record: Omit<CaptureHistoryRecord, "id" | "revertedAt">) {
    this.database
      .prepare(`
        INSERT INTO capture_history (
          ip,
          session_id,
          season_id,
          town_name,
          previous_region,
          new_region,
          previous_last_captured_at,
          captured_at,
          reverted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `)
      .run(
        record.ip,
        record.sessionId,
        record.seasonId,
        record.townName,
        record.previousRegion,
        record.newRegion,
        record.previousLastCapturedAt,
        record.capturedAt,
      );
  }

  loadUnrevertedCapturesForIp(ip: string, seasonId: string) {
    const rows = this.database
      .prepare(`
        SELECT
          id,
          ip,
          session_id,
          season_id,
          town_name,
          previous_region,
          new_region,
          previous_last_captured_at,
          captured_at,
          reverted_at
        FROM capture_history
        WHERE ip = ? AND season_id = ? AND reverted_at IS NULL
        ORDER BY captured_at DESC, id DESC
      `)
      .all(ip, seasonId) as Array<{
        captured_at: number;
        id: number;
        ip: string;
        new_region: RegionName;
        previous_last_captured_at: number | null;
        previous_region: RegionName;
        reverted_at: number | null;
        season_id: string;
        session_id: string;
        town_name: TownName;
      }>;

    return rows.map((row) => ({
      capturedAt: row.captured_at,
      id: row.id,
      ip: row.ip,
      newRegion: row.new_region,
      previousLastCapturedAt: row.previous_last_captured_at,
      previousRegion: row.previous_region,
      revertedAt: row.reverted_at,
      seasonId: row.season_id,
      sessionId: row.session_id,
      townName: row.town_name,
    }));
  }

  loadUnrevertedCapturesForSessions(sessionIds: string[], seasonId: string) {
    if (!sessionIds.length) {
      return [];
    }

    const uniqueSessionIds = [...new Set(sessionIds)];
    const placeholders = uniqueSessionIds.map(() => "?").join(", ");
    const rows = this.database
      .prepare(`
        SELECT
          id,
          ip,
          session_id,
          season_id,
          town_name,
          previous_region,
          new_region,
          previous_last_captured_at,
          captured_at,
          reverted_at
        FROM capture_history
        WHERE session_id IN (${placeholders}) AND season_id = ? AND reverted_at IS NULL
        ORDER BY captured_at DESC, id DESC
      `)
      .all(...uniqueSessionIds, seasonId) as Array<{
        captured_at: number;
        id: number;
        ip: string;
        new_region: RegionName;
        previous_last_captured_at: number | null;
        previous_region: RegionName;
        reverted_at: number | null;
        season_id: string;
        session_id: string;
        town_name: TownName;
      }>;

    return rows.map((row) => ({
      capturedAt: row.captured_at,
      id: row.id,
      ip: row.ip,
      newRegion: row.new_region,
      previousLastCapturedAt: row.previous_last_captured_at,
      previousRegion: row.previous_region,
      revertedAt: row.reverted_at,
      seasonId: row.season_id,
      sessionId: row.session_id,
      townName: row.town_name,
    }));
  }

  markCapturesReverted(captureIds: number[], revertedAt: number) {
    if (!captureIds.length) {
      return;
    }

    const updateStatement = this.database.prepare(`
      UPDATE capture_history
      SET reverted_at = ?
      WHERE id = ?
    `);

    for (const captureId of captureIds) {
      updateStatement.run(revertedAt, captureId);
    }
  }
}

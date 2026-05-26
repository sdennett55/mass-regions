import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { PlayerState, SeasonState } from "../../src/game/types.ts";

const PLAYER_STATE_RETENTION_MS = 24 * 60 * 60 * 1000;
const FINGERPRINT_RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_PERSISTED_PLAYER_STATES = 25_000;
const MAX_PERSISTED_FINGERPRINT_RECORDS = 10_000;
const PRUNE_WRITE_INTERVAL = 25;

export type FingerprintRecord = {
  issuedAtTimestamps: number[];
  lastIssuedSessionId: string | null;
};

function isPlayerState(value: unknown): value is PlayerState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlayerState>;
  return (
    typeof candidate.actionPoints === "number" &&
    typeof candidate.lastRegeneratedAt === "number"
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
  private writesSinceLastPrune = 0;

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
    `);

    this.ensureColumnExists(
      "player_states",
      "updated_at",
      "INTEGER NOT NULL DEFAULT 0",
    );
    this.ensureColumnExists(
      "session_fingerprints",
      "updated_at",
      "INTEGER NOT NULL DEFAULT 0",
    );
    this.pruneStoredData(Date.now());
  }

  private ensureColumnExists(
    tableName: "player_states" | "session_fingerprints",
    columnName: string,
    columnDefinition: string,
  ) {
    const existingColumns = this.database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>;

    if (existingColumns.some((column) => column.name === columnName)) {
      return;
    }

    this.database.exec(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`,
    );
  }

  private maybePruneStoredData(now: number) {
    this.writesSinceLastPrune += 1;
    if (this.writesSinceLastPrune < PRUNE_WRITE_INTERVAL) {
      return;
    }

    this.writesSinceLastPrune = 0;
    this.pruneStoredData(now);
  }

  private pruneStoredData(now: number) {
    this.database
      .prepare("DELETE FROM player_states WHERE updated_at < ?")
      .run(now - PLAYER_STATE_RETENTION_MS);

    this.database
      .prepare("DELETE FROM session_fingerprints WHERE updated_at < ?")
      .run(now - FINGERPRINT_RECORD_RETENTION_MS);

    this.database
      .prepare(`
        DELETE FROM player_states
        WHERE player_id IN (
          SELECT player_id
          FROM player_states
          ORDER BY updated_at DESC
          LIMIT -1 OFFSET ?
        )
      `)
      .run(MAX_PERSISTED_PLAYER_STATES);

    this.database
      .prepare(`
        DELETE FROM session_fingerprints
        WHERE fingerprint IN (
          SELECT fingerprint
          FROM session_fingerprints
          ORDER BY updated_at DESC
          LIMIT -1 OFFSET ?
        )
      `)
      .run(MAX_PERSISTED_FINGERPRINT_RECORDS);
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
    const now = Date.now();

    this.database
      .prepare(`
        INSERT INTO player_states (player_id, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(player_id) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .run(playerId, JSON.stringify(playerState), now);

    this.maybePruneStoredData(now);
  }

  loadFingerprintRecord(fingerprint: string) {
    const row = this.database
      .prepare("SELECT value FROM session_fingerprints WHERE fingerprint = ?")
      .get(fingerprint) as { value: string } | undefined;

    return parseJsonValue<FingerprintRecord>(row?.value, isFingerprintRecord);
  }

  saveFingerprintRecord(fingerprint: string, record: FingerprintRecord) {
    const now = Date.now();

    this.database
      .prepare(`
        INSERT INTO session_fingerprints (fingerprint, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(fingerprint) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .run(fingerprint, JSON.stringify(record), now);

    this.maybePruneStoredData(now);
  }
}

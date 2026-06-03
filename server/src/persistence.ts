import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { PlayerState, SeasonState } from "../../src/game/types.ts";

export type FingerprintRecord = {
  issuedAtTimestamps: number[];
  lastIssuedSessionId: string | null;
};

export type IpBlockRecord = {
  blockedUntil: number | null;
  createdAt: number;
  reason: string;
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
    typeof candidate.reason === "string"
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

  loadIpBlocks() {
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
          record,
        };
      })
      .filter((row): row is { ip: string; record: IpBlockRecord } => row !== null);
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
}

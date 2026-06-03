import type {
  ServerIpActivitySnapshot,
  ServerIpModerationSnapshot,
} from "./protocol.ts"
import type { IpBlockRecord, ServerPersistence } from "./persistence.ts"

const ACTION_ACTIVITY_WINDOW_MS = 10 * 60 * 1000
const HOT_IP_LIMIT = 8

type IpEntry = {
  actionTimestamps: number[]
  blockedSessionIds: string[]
  blockReason: string | null
  blockedUntil: number | null
  isManualBlock: boolean
  newSessionTimestamps: number[]
  sessionLastSeenAt: Map<string, number>
}

type IpModerationConfig = {
  blockedIps: Set<string>
  exemptIps: Set<string>
  maxNewSessions: number
  newSessionWindowMs: number
  persistence: ServerPersistence
  timeoutDurationMs: number
}

type IpBlockStatus = {
  blockReason: string | null
  blockedSessionIds: string[]
  blockedUntil: number | null
  isBlocked: boolean
}

function isFiniteTimestamp(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
}

export class IpModerationTracker {
  private readonly entries = new Map<string, IpEntry>()

  constructor(private readonly config: IpModerationConfig) {
    this.hydratePersistedBlocks()
  }

  private hydratePersistedBlocks(now = Date.now()) {
    for (const { ip, record } of this.config.persistence.loadIpBlocks()) {
      if (this.isExemptIp(ip)) {
        this.config.persistence.deleteIpBlock(ip)
        continue
      }

      const blockedUntil =
        typeof record.blockedUntil === "number" ? record.blockedUntil : null

      if (blockedUntil !== null && blockedUntil <= now) {
        this.config.persistence.deleteIpBlock(ip)
        continue
      }

      const entry = this.getEntry(ip)
      entry.blockReason = record.reason
      entry.blockedSessionIds = record.sessionIds ?? []
      entry.blockedUntil = blockedUntil
      entry.isManualBlock = record.reason === "Timed out by admin."
    }
  }

  private isExemptIp(ip: string) {
    return this.config.exemptIps.has(ip)
  }

  private persistIpBlock(ip: string, record: IpBlockRecord) {
    this.config.persistence.saveIpBlock(ip, record)
  }

  private getEntry(ip: string) {
    let entry = this.entries.get(ip)
    if (!entry) {
      entry = {
        actionTimestamps: [],
        blockedSessionIds: [],
        blockReason: null,
        blockedUntil: null,
        isManualBlock: false,
        newSessionTimestamps: [],
        sessionLastSeenAt: new Map<string, number>(),
      }
      this.entries.set(ip, entry)
    }

    return entry
  }

  private getSessionActivityWindowMs() {
    return Math.max(ACTION_ACTIVITY_WINDOW_MS, this.config.newSessionWindowMs)
  }

  private noteSessionActivity(entry: IpEntry, sessionId: string, now: number) {
    entry.sessionLastSeenAt.set(sessionId, now)
  }

  private getRecentSessionIds(entry: IpEntry, now: number) {
    const sessionActivityWindowMs = this.getSessionActivityWindowMs()

    for (const [sessionId, lastSeenAt] of entry.sessionLastSeenAt.entries()) {
      if (now - lastSeenAt >= sessionActivityWindowMs) {
        entry.sessionLastSeenAt.delete(sessionId)
      }
    }

    return [...entry.sessionLastSeenAt.keys()]
  }

  private pruneEntry(ip: string, now: number) {
    const entry = this.entries.get(ip)
    if (!entry) {
      return
    }

    if (this.isExemptIp(ip)) {
      if (isFiniteTimestamp(entry.blockedUntil) || entry.blockReason !== null) {
        entry.blockedSessionIds = []
        entry.blockedUntil = null
        entry.blockReason = null
        entry.isManualBlock = false
        this.config.persistence.deleteIpBlock(ip)
      }
    }

    entry.actionTimestamps = entry.actionTimestamps.filter(
      (timestamp) => now - timestamp < ACTION_ACTIVITY_WINDOW_MS,
    )
    entry.newSessionTimestamps = entry.newSessionTimestamps.filter(
      (timestamp) => now - timestamp < this.config.newSessionWindowMs,
    )
    this.getRecentSessionIds(entry, now)

    const blockedUntil =
      typeof entry.blockedUntil === "number" ? entry.blockedUntil : null
    if (blockedUntil !== null && blockedUntil <= now) {
      entry.blockedSessionIds = []
      entry.blockedUntil = null
      entry.blockReason = null
      entry.isManualBlock = false
      this.config.persistence.deleteIpBlock(ip)
    }

    const shouldDelete =
      entry.actionTimestamps.length === 0 &&
      entry.newSessionTimestamps.length === 0 &&
      !isFiniteTimestamp(entry.blockedUntil)

    if (shouldDelete) {
      this.entries.delete(ip)
    }
  }

  private getDynamicBlockStatus(ip: string, now: number): IpBlockStatus {
    this.pruneEntry(ip, now)
    const entry = this.entries.get(ip)

    if (!entry) {
      return {
        blockReason: null,
        blockedSessionIds: [],
        blockedUntil: null,
        isBlocked: false,
      }
    }

    const blockedUntil =
      typeof entry.blockedUntil === "number" ? entry.blockedUntil : null
    const isTimedBlockActive = blockedUntil !== null && blockedUntil > now

    if (!isTimedBlockActive) {
      return {
        blockReason: null,
        blockedSessionIds: [],
        blockedUntil: null,
        isBlocked: false,
      }
    }

    return {
      blockReason: entry.blockReason,
      blockedSessionIds: entry.blockedSessionIds,
      blockedUntil: entry.blockedUntil,
      isBlocked: entry.isManualBlock || isTimedBlockActive,
    }
  }

  getBlockStatus(ip: string, now = Date.now()): IpBlockStatus {
    if (this.isExemptIp(ip)) {
      return {
        blockReason: null,
        blockedSessionIds: [],
        blockedUntil: null,
        isBlocked: false,
      }
    }

    if (this.config.blockedIps.has(ip)) {
      return {
        blockReason: "Blocked by server configuration.",
        blockedSessionIds: [],
        blockedUntil: null,
        isBlocked: true,
      }
    }

    return this.getDynamicBlockStatus(ip, now)
  }

  recordNewSession(ip: string, sessionId: string, now = Date.now()) {
    if (this.isExemptIp(ip)) {
      const entry = this.getEntry(ip)
      this.noteSessionActivity(entry, sessionId, now)
      entry.newSessionTimestamps.push(now)
      this.pruneEntry(ip, now)

      return {
        autoBlocked: false,
        blockReason: null,
        blockedSessionIds: [],
      }
    }

    if (this.config.blockedIps.has(ip)) {
      return {
        autoBlocked: false,
        blockReason: "Blocked by server configuration.",
        blockedSessionIds: [],
      }
    }

    const entry = this.getEntry(ip)
    this.noteSessionActivity(entry, sessionId, now)
    entry.newSessionTimestamps.push(now)
    this.pruneEntry(ip, now)

    const nextEntry = this.entries.get(ip)
    if (!nextEntry) {
      return {
        autoBlocked: false,
        blockReason: null,
        blockedSessionIds: [],
      }
    }

    if (nextEntry.newSessionTimestamps.length <= this.config.maxNewSessions) {
      return {
        autoBlocked: false,
        blockReason: null,
        blockedSessionIds: [],
      }
    }

    const blockedUntil =
      typeof nextEntry.blockedUntil === "number" ? nextEntry.blockedUntil : null
    const alreadyBlocked = blockedUntil !== null && blockedUntil > now
    const blockedSessionIds = this.getRecentSessionIds(nextEntry, now)

    nextEntry.blockedSessionIds = blockedSessionIds
    nextEntry.blockedUntil = Math.max(
      nextEntry.blockedUntil ?? 0,
      now + this.config.timeoutDurationMs,
    )
    nextEntry.blockReason = "Too many new sessions from this network."
    this.persistIpBlock(ip, {
      blockedUntil: nextEntry.blockedUntil,
      createdAt: now,
      reason: nextEntry.blockReason,
      sessionIds: blockedSessionIds,
    })

    return {
      autoBlocked: !alreadyBlocked,
      blockReason: nextEntry.blockReason,
      blockedSessionIds,
    }
  }

  recordAction(ip: string, sessionId: string, now = Date.now()) {
    if (this.isExemptIp(ip)) {
      const entry = this.getEntry(ip)
      this.noteSessionActivity(entry, sessionId, now)
      entry.actionTimestamps.push(now)
      this.pruneEntry(ip, now)
      return
    }

    if (this.config.blockedIps.has(ip)) {
      return
    }

    const entry = this.getEntry(ip)
    this.noteSessionActivity(entry, sessionId, now)
    entry.actionTimestamps.push(now)
    this.pruneEntry(ip, now)
  }

  blockIp(ip: string, durationMs: number, now = Date.now()) {
    if (this.isExemptIp(ip)) {
      this.unblockIp(ip)
      return {
        blockedSessionIds: [],
        ok: false,
      }
    }

    const entry = this.getEntry(ip)
    const blockedSessionIds = this.getRecentSessionIds(entry, now)
    entry.blockedSessionIds = blockedSessionIds
    entry.blockedUntil = now + durationMs
    entry.blockReason = "Timed out by admin."
    entry.isManualBlock = true
    this.persistIpBlock(ip, {
      blockedUntil: entry.blockedUntil,
      createdAt: now,
      reason: entry.blockReason,
      sessionIds: blockedSessionIds,
    })

    return {
      blockedSessionIds,
      ok: true,
    }
  }

  unblockIp(ip: string) {
    const entry = this.entries.get(ip)
    if (!entry) {
      return
    }

    entry.blockedSessionIds = []
    entry.blockReason = null
    entry.blockedUntil = null
    entry.isManualBlock = false
    this.config.persistence.deleteIpBlock(ip)
    this.pruneEntry(ip, Date.now())
  }

  getSnapshot(now = Date.now()): ServerIpModerationSnapshot {
    const hotIps: ServerIpActivitySnapshot[] = []
    const ips = new Set<string>([
      ...this.config.blockedIps,
      ...this.entries.keys(),
    ])

    for (const ip of ips) {
      this.pruneEntry(ip, now)
      const entry = this.entries.get(ip)
      const blockStatus = this.getBlockStatus(ip, now)

      if (
        !blockStatus.isBlocked &&
        !entry?.actionTimestamps.length &&
        !entry?.newSessionTimestamps.length
      ) {
        continue
      }

      hotIps.push({
        actionCountLastWindow: entry?.actionTimestamps.length ?? 0,
        blockReason: blockStatus.blockReason,
        blockedUntil: blockStatus.blockedUntil,
        ip,
        isBlocked: blockStatus.isBlocked,
        newSessionsLastWindow: entry?.newSessionTimestamps.length ?? 0,
      })
    }

    hotIps.sort((left, right) => {
      if (left.isBlocked !== right.isBlocked) {
        return left.isBlocked ? -1 : 1
      }

      if (left.newSessionsLastWindow !== right.newSessionsLastWindow) {
        return right.newSessionsLastWindow - left.newSessionsLastWindow
      }

      if (left.actionCountLastWindow !== right.actionCountLastWindow) {
        return right.actionCountLastWindow - left.actionCountLastWindow
      }

      return left.ip.localeCompare(right.ip)
    })

    return {
      activeBlockedIps: hotIps.filter((candidate) => candidate.isBlocked).length,
      hotIps: hotIps.slice(0, HOT_IP_LIMIT),
    }
  }
}

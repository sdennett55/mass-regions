import type { ServerStatsSnapshot } from "./protocol.ts"

type RecordedAction = {
  durationMs: number
  ok: boolean
  timestamp: number
}

const ONE_MINUTE_MS = 60 * 1000

function roundTo(value: number, digits = 2) {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

export class RuntimeStatsTracker {
  private activeSseConnections = 0
  private peakSseConnections = 0
  private totalSseConnections = 0
  private totalStateRequests = 0
  private totalActions = 0
  private successfulActions = 0
  private rejectedActions = 0
  private totalActionLatencyMs = 0
  private sessionSyncErrors = 0
  private recentActionTimestamps: number[] = []
  private recentSseConnectionTimestamps: number[] = []
  private recentStateRequestTimestamps: number[] = []

  private pruneRecentTimestamps(now: number) {
    this.recentActionTimestamps = this.recentActionTimestamps.filter(
      (timestamp) => now - timestamp < ONE_MINUTE_MS,
    )
    this.recentSseConnectionTimestamps = this.recentSseConnectionTimestamps.filter(
      (timestamp) => now - timestamp < ONE_MINUTE_MS,
    )
    this.recentStateRequestTimestamps = this.recentStateRequestTimestamps.filter(
      (timestamp) => now - timestamp < ONE_MINUTE_MS,
    )
  }

  recordStateRequest(now = Date.now()) {
    this.totalStateRequests += 1
    this.recentStateRequestTimestamps.push(now)
    this.pruneRecentTimestamps(now)
  }

  recordAction(action: RecordedAction) {
    this.totalActions += 1
    this.totalActionLatencyMs += action.durationMs
    if (action.ok) {
      this.successfulActions += 1
    } else {
      this.rejectedActions += 1
    }

    this.recentActionTimestamps.push(action.timestamp)
    this.pruneRecentTimestamps(action.timestamp)
  }

  recordSessionSyncError(now = Date.now()) {
    this.sessionSyncErrors += 1
    this.recentActionTimestamps.push(now)
    this.pruneRecentTimestamps(now)
  }

  recordSseConnectionOpened(now = Date.now()) {
    this.activeSseConnections += 1
    this.totalSseConnections += 1
    this.peakSseConnections = Math.max(
      this.peakSseConnections,
      this.activeSseConnections,
    )
    this.recentSseConnectionTimestamps.push(now)
    this.pruneRecentTimestamps(now)
  }

  recordSseConnectionClosed() {
    this.activeSseConnections = Math.max(0, this.activeSseConnections - 1)
  }

  getSnapshot(now = Date.now()): ServerStatsSnapshot {
    this.pruneRecentTimestamps(now)

    const memoryUsage = process.memoryUsage()

    return {
      actions: {
        averageLatencyMs:
          this.totalActions > 0
            ? roundTo(this.totalActionLatencyMs / this.totalActions)
            : 0,
        lastMinute: this.recentActionTimestamps.length,
        rejected: this.rejectedActions,
        sessionSyncErrors: this.sessionSyncErrors,
        successful: this.successfulActions,
        total: this.totalActions,
      },
      memory: {
        heapUsedMb: roundTo(memoryUsage.heapUsed / 1024 / 1024),
        rssMb: roundTo(memoryUsage.rss / 1024 / 1024),
      },
      requests: {
        stateLastMinute: this.recentStateRequestTimestamps.length,
        stateTotal: this.totalStateRequests,
      },
      sse: {
        activeConnections: this.activeSseConnections,
        connectionAttemptsLastMinute: this.recentSseConnectionTimestamps.length,
        peakConnections: this.peakSseConnections,
        totalConnections: this.totalSseConnections,
      },
      uptimeSeconds: Math.round(process.uptime()),
    }
  }

  formatSummary(now = Date.now()) {
    const snapshot = this.getSnapshot(now)
    return [
      `[stats] uptime=${snapshot.uptimeSeconds}s`,
      `sse=${snapshot.sse.activeConnections} active`,
      `actions=${snapshot.actions.lastMinute}/min`,
      `avgAction=${snapshot.actions.averageLatencyMs}ms`,
      `states=${snapshot.requests.stateLastMinute}/min`,
      `heap=${snapshot.memory.heapUsedMb}MB`,
    ].join(" | ")
  }
}

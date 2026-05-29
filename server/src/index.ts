import { timingSafeEqual } from "node:crypto"

import cors from "cors"
import express from "express"
import type { Request, Response } from "express"
import { rateLimit } from "express-rate-limit"

import type { PlayerAction } from "../../src/game/types.ts"

import { serverConfig } from "./config.ts"
import { TerritoryGameStore } from "./gameStore.ts"
import { ServerPersistence } from "./persistence.ts"
import { RuntimeStatsTracker } from "./runtimeStats.ts"
import { AnonymousSessionManager } from "./sessions.ts"
import type {
  ServerActionRequest,
  ServerGameEvent,
  ServerStateResponse,
} from "./protocol.ts"

const app = express()
app.set("trust proxy", 3)
const persistence = new ServerPersistence(serverConfig.databasePath)
const store = new TerritoryGameStore(persistence)
const runtimeStats = new RuntimeStatsTracker()
const sessionManager = new AnonymousSessionManager()

const stateLimiter = rateLimit({
  legacyHeaders: false,
  message: { error: "Too many state refreshes. Please slow down." },
  standardHeaders: "draft-8",
  windowMs: 60 * 1000,
  limit: 240,
})

const actionLimiter = rateLimit({
  legacyHeaders: false,
  message: { error: "Too many actions right now. Please slow down." },
  standardHeaders: "draft-8",
  windowMs: 60 * 1000,
  limit: 40,
})

const eventLimiter = rateLimit({
  legacyHeaders: false,
  message: { error: "Too many live-connection attempts. Please slow down." },
  standardHeaders: "draft-8",
  windowMs: 60 * 1000,
  limit: 30,
})

const statsLimiter = rateLimit({
  legacyHeaders: false,
  message: { error: "Too many stats requests. Please slow down." },
  standardHeaders: "draft-8",
  windowMs: 60 * 1000,
  limit: 60,
})

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      callback(
        serverConfig.isAllowedOrigin(origin)
          ? null
          : new Error("Origin not allowed by CORS"),
        serverConfig.isAllowedOrigin(origin) ? origin ?? true : false,
      )
    },
  }),
)
app.use((_request, response, next) => {
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()")
  response.setHeader("Referrer-Policy", "same-origin")
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.setHeader("X-Frame-Options", "DENY")

  if (serverConfig.isProduction) {
    response.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    )
  }

  next()
})
app.use(express.json())

function hasValidAdminStatsToken(request: Request) {
  const configuredToken = serverConfig.adminStatsToken
  if (!configuredToken) {
    return false
  }

  const providedToken = request.get("x-admin-token")?.trim()
  if (!providedToken) {
    return false
  }

  const providedBuffer = Buffer.from(providedToken)
  const configuredBuffer = Buffer.from(configuredToken)

  return (
    providedBuffer.length === configuredBuffer.length &&
    timingSafeEqual(providedBuffer, configuredBuffer)
  )
}

function isTruthyQueryParam(value: unknown) {
  if (typeof value !== "string") {
    return false
  }

  const normalizedValue = value.trim().toLowerCase()
  return normalizedValue !== "" && normalizedValue !== "0" && normalizedValue !== "false"
}

function isPlayerAction(value: unknown): value is PlayerAction {
  if (!value || typeof value !== "object") {
    return false
  }

  const action = value as Partial<PlayerAction>

  if (action.type === "defend") {
    return typeof action.townName === "string"
  }

  if (action.type === "invade") {
    return (
      typeof action.townName === "string" &&
      typeof action.invadingRegion === "string"
    )
  }

  return false
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    uptimeSeconds: Math.round(process.uptime()),
  })
})

app.get("/api/stats", statsLimiter, (request, response) => {
  if (!serverConfig.adminStatsToken) {
    response.status(404).json({ error: "Admin stats are unavailable." })
    return
  }

  if (!hasValidAdminStatsToken(request)) {
    response.status(401).json({ error: "Admin token required." })
    return
  }

  response.json(runtimeStats.getSnapshot())
})

app.get(
  "/api/state",
  stateLimiter,
  (request, response: Response<ServerStateResponse | { error: string }>) => {
    runtimeStats.recordStateRequest()
    const { sessionId } = sessionManager.resolveSession(request, response)
    const shouldRefillActionPoints =
      !serverConfig.isProduction &&
      (isTruthyQueryParam(request.query.refillActionPoints) ||
        isTruthyQueryParam(request.query.refillInfluence))

    if (shouldRefillActionPoints) {
      response.json({
        snapshot: store.refillPlayerActionPoints(sessionId),
      })
      return
    }

    response.json({
      snapshot: store.getSnapshot(sessionId),
    })
  },
)

app.post(
  "/api/actions",
  actionLimiter,
  (request: Request, response) => {
    const startedAt = performance.now()
    const { action } = (request.body ?? {}) as Partial<ServerActionRequest>

    if (!isPlayerAction(action)) {
      runtimeStats.recordAction({
        durationMs: performance.now() - startedAt,
        ok: false,
        timestamp: Date.now(),
      })
      response.status(400).json({ error: "Invalid action payload." })
      return
    }

    const resolvedSession = sessionManager.resolveExistingSession(request, response)

    if (!resolvedSession) {
      runtimeStats.recordSessionSyncError()
      const { sessionId } = sessionManager.resolveSession(request, response)
      runtimeStats.recordAction({
        durationMs: performance.now() - startedAt,
        ok: false,
        timestamp: Date.now(),
      })
      response.status(409).json({
        error: "Session syncing. Please try again.",
        ok: false,
        snapshot: store.getSnapshot(sessionId),
      })
      return
    }

    const { sessionId } = resolvedSession
    const result = store.applyPlayerAction(sessionId, action)
    runtimeStats.recordAction({
      durationMs: performance.now() - startedAt,
      ok: result.ok,
      timestamp: Date.now(),
    })
    response.status(result.ok ? 200 : 409).json({
      ...result,
    })
  },
)

app.get("/api/events", eventLimiter, (request, response) => {
  const resolvedSession = sessionManager.resolveExistingSession(request, response)

  if (!resolvedSession) {
    response.status(409).end()
    return
  }

  const { sessionId } = resolvedSession
  runtimeStats.recordSseConnectionOpened()

  response.setHeader("Cache-Control", "no-cache, no-transform")
  response.setHeader("Connection", "keep-alive")
  response.setHeader("Content-Type", "text/event-stream")
  response.flushHeaders()

  const sendEvent = (eventName: string, data: unknown) => {
    response.write(`event: ${eventName}\n`)
    response.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  sendEvent("snapshot", store.getSnapshot(sessionId))

  const unsubscribe = store.subscribe((event: ServerGameEvent) => {
    sendEvent(event.type, event)
  })

  const heartbeatId = setInterval(() => {
    sendEvent("heartbeat", { serverTime: Date.now() })
  }, serverConfig.sseHeartbeatMs)

  request.on("close", () => {
    runtimeStats.recordSseConnectionClosed()
    clearInterval(heartbeatId)
    unsubscribe()
    response.end()
  })
})

const statsSummaryIntervalId = setInterval(() => {
  console.log(runtimeStats.formatSummary())
}, 60 * 1000)
statsSummaryIntervalId.unref()

app.listen(serverConfig.port, () => {
  console.log(
    `Mass Regions server listening on http://localhost:${serverConfig.port}`,
  )
})

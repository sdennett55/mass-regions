import cors from "cors"
import express from "express"
import type { Request, Response } from "express"
import { rateLimit } from "express-rate-limit"

import type { PlayerAction } from "../../src/game/types.ts"

import { serverConfig } from "./config.ts"
import { TerritoryGameStore } from "./gameStore.ts"
import { ServerPersistence } from "./persistence.ts"
import { AnonymousSessionManager } from "./sessions.ts"
import type {
  ServerActionRequest,
  ServerStateResponse,
} from "./protocol.ts"

const app = express()
app.set("trust proxy", 3)
const persistence = new ServerPersistence(serverConfig.databasePath)
const store = new TerritoryGameStore(persistence)
const sessionManager = new AnonymousSessionManager(persistence)

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
app.use(express.json())

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

app.get(
  "/api/state",
  stateLimiter,
  (request, response: Response<ServerStateResponse | { error: string }>) => {
    const { sessionId, sessionToken } = sessionManager.resolveSession(request, response)
    const shouldRefillActionPoints =
      !serverConfig.isProduction &&
      (isTruthyQueryParam(request.query.refillActionPoints) ||
        isTruthyQueryParam(request.query.refillInfluence))

    if (shouldRefillActionPoints) {
      response.json({
        sessionToken,
        snapshot: store.refillPlayerActionPoints(sessionId),
      })
      return
    }

    response.json({
      sessionToken,
      snapshot: store.getSnapshot(sessionId),
    })
  },
)

app.post(
  "/api/actions",
  actionLimiter,
  (request: Request, response) => {
    const { action } = (request.body ?? {}) as Partial<ServerActionRequest>

    if (!isPlayerAction(action)) {
      response.status(400).json({ error: "Invalid action payload." })
      return
    }

    const { sessionId, sessionToken } = sessionManager.resolveSession(request, response)
    const result = store.applyPlayerAction(sessionId, action)
    response.status(result.ok ? 200 : 409).json({
      ...result,
      sessionToken,
    })
  },
)

app.get("/api/events", eventLimiter, (request, response) => {
  const { sessionId } = sessionManager.resolveSession(request, response)

  response.setHeader("Cache-Control", "no-cache, no-transform")
  response.setHeader("Connection", "keep-alive")
  response.setHeader("Content-Type", "text/event-stream")
  response.flushHeaders()

  const sendEvent = (eventName: string, data: unknown) => {
    response.write(`event: ${eventName}\n`)
    response.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  sendEvent("snapshot", store.getSnapshot(sessionId))

  const unsubscribe = store.subscribe(() => {
    sendEvent("snapshot", store.getSnapshot(sessionId))
  })

  const heartbeatId = setInterval(() => {
    sendEvent("heartbeat", { serverTime: Date.now() })
  }, serverConfig.sseHeartbeatMs)

  request.on("close", () => {
    clearInterval(heartbeatId)
    unsubscribe()
    response.end()
  })
})

app.listen(serverConfig.port, () => {
  console.log(
    `Mass Regions server listening on http://localhost:${serverConfig.port}`,
  )
})

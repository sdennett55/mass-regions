import cors from "cors"
import express from "express"
import type { Request, Response } from "express"

import type { PlayerAction } from "../../src/game/types.ts"

import { serverConfig } from "./config.ts"
import { TerritoryGameStore } from "./gameStore.ts"
import type {
  ServerActionRequest,
  ServerStateResponse,
} from "./protocol.ts"

const app = express()
const store = new TerritoryGameStore()

app.use(
  cors({
    credentials: false,
    origin(origin, callback) {
      callback(
        null,
        serverConfig.isAllowedOrigin(origin) ? origin ?? true : false,
      )
    },
  }),
)
app.use(express.json())

function getPlayerIdFromRequest(request: Request) {
  const rawPlayerId = request.query.playerId
  return typeof rawPlayerId === "string" && rawPlayerId.trim()
    ? rawPlayerId.trim()
    : null
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

app.get("/api/state", (request, response: Response<ServerStateResponse | { error: string }>) => {
  const playerId = getPlayerIdFromRequest(request)

  if (!playerId) {
    response.status(400).json({ error: "Missing playerId query parameter." })
    return
  }

  response.json({
    snapshot: store.getSnapshot(playerId),
  })
})

app.post(
  "/api/actions",
  (
    request: Request<unknown, unknown, Partial<ServerActionRequest>>,
    response,
  ) => {
    const { action, playerId } = request.body ?? {}

    if (typeof playerId !== "string" || !playerId.trim()) {
      response.status(400).json({ error: "Missing playerId." })
      return
    }

    if (!isPlayerAction(action)) {
      response.status(400).json({ error: "Invalid action payload." })
      return
    }

    const result = store.applyPlayerAction(playerId.trim(), action)
    response.status(result.ok ? 200 : 409).json(result)
  },
)

app.get("/api/events", (request, response) => {
  const playerId = getPlayerIdFromRequest(request)

  if (!playerId) {
    response.status(400).json({ error: "Missing playerId query parameter." })
    return
  }

  response.setHeader("Cache-Control", "no-cache, no-transform")
  response.setHeader("Connection", "keep-alive")
  response.setHeader("Content-Type", "text/event-stream")
  response.flushHeaders()

  const sendEvent = (eventName: string, data: unknown) => {
    response.write(`event: ${eventName}\n`)
    response.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  sendEvent("snapshot", store.getSnapshot(playerId))

  const unsubscribe = store.subscribe(() => {
    sendEvent("snapshot", store.getSnapshot(playerId))
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

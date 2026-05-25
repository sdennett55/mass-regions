const DEFAULT_PORT = 4000
const DEFAULT_CLIENT_ORIGIN = "http://localhost:5173"

function parsePort(value: string | undefined) {
  const parsedPort = Number(value)
  return Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT
}

function parseOrigins(value: string | undefined) {
  return (value ?? DEFAULT_CLIENT_ORIGIN)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin)
    return url.protocol === "http:" && (
      url.hostname === "localhost" || url.hostname === "127.0.0.1"
    )
  } catch {
    return false
  }
}

function createAllowedOriginChecker(configuredOrigins: string[]) {
  const explicitOrigins = new Set(configuredOrigins)

  return (origin: string | undefined) => {
    if (!origin) {
      return true
    }

    return explicitOrigins.has(origin) || isLoopbackOrigin(origin)
  }
}

const allowedOrigins = parseOrigins(process.env.CLIENT_ORIGIN)

export const serverConfig = {
  allowedOrigins,
  isAllowedOrigin: createAllowedOriginChecker(allowedOrigins),
  port: parsePort(process.env.PORT),
  sseHeartbeatMs: 15_000,
}

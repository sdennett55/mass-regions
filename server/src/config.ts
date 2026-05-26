import { randomBytes } from "node:crypto"
import path from "node:path"

const DEFAULT_PORT = 4000
const DEFAULT_CLIENT_ORIGIN = "http://localhost:5173"
const DEFAULT_SESSION_COOKIE_NAME = "mr_sid"
const DEFAULT_SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_SQLITE_FILENAME = "mass-regions.sqlite"

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (typeof value !== "string") {
    return fallback
  }

  const normalizedValue = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalizedValue)) {
    return true
  }

  if (["0", "false", "no", "off"].includes(normalizedValue)) {
    return false
  }

  return fallback
}

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

function parseSessionCookieMaxAgeMs(value: string | undefined) {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : DEFAULT_SESSION_COOKIE_MAX_AGE_MS
}

function resolveDatabasePath(
  dataDirValue: string | undefined,
  filenameValue: string | undefined,
) {
  const dataDir = dataDirValue?.trim()
    ? path.resolve(dataDirValue)
    : path.resolve(process.cwd(), ".data")
  const filename = filenameValue?.trim() || DEFAULT_SQLITE_FILENAME

  return path.join(dataDir, filename)
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
const isProduction = process.env.NODE_ENV === "production"
const sessionSecret =
  process.env.SESSION_SECRET?.trim() || randomBytes(32).toString("hex")

if (isProduction && !process.env.SESSION_SECRET?.trim()) {
  throw new Error("SESSION_SECRET must be set in production.")
}

export const serverConfig = {
  allowedOrigins,
  isAllowedOrigin: createAllowedOriginChecker(allowedOrigins),
  isProduction,
  port: parsePort(process.env.PORT),
  databasePath: resolveDatabasePath(
    process.env.DATA_DIR,
    process.env.SQLITE_FILENAME,
  ),
  sessionCookieMaxAgeMs: parseSessionCookieMaxAgeMs(
    process.env.SESSION_COOKIE_MAX_AGE_MS,
  ),
  sessionCookieName:
    process.env.SESSION_COOKIE_NAME?.trim() || DEFAULT_SESSION_COOKIE_NAME,
  sessionSecret,
  sseHeartbeatMs: 15_000,
  useSecureCookies: parseBoolean(process.env.SECURE_COOKIES, isProduction),
}

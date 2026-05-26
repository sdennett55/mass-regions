import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Request, Response } from "express";

import { serverConfig } from "./config.ts";
import type { FingerprintRecord, ServerPersistence } from "./persistence.ts";

const NEW_SESSION_WINDOW_MS = 30 * 60 * 1000;
const NEW_SESSION_REUSE_THRESHOLD = 3;

function normalizeIpAddress(rawIp: string) {
  return rawIp.startsWith("::ffff:") ? rawIp.slice(7) : rawIp;
}

function getIpBucket(rawIp: string) {
  const ip = normalizeIpAddress(rawIp);
  const ipVersion = isIP(ip);

  if (ipVersion === 4) {
    return ip.split(".").slice(0, 3).join(".");
  }

  if (ipVersion === 6) {
    return ip
      .split(":")
      .filter(Boolean)
      .slice(0, 4)
      .join(":");
  }

  return ip;
}

function parseCookieHeader(cookieHeader: string | undefined) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (!rawName || rawValueParts.length === 0) {
      continue;
    }

    cookies.set(rawName, rawValueParts.join("="));
  }

  return cookies;
}

function signSessionId(sessionId: string) {
  const signature = createHmac("sha256", serverConfig.sessionSecret)
    .update(sessionId)
    .digest("base64url");

  return `${sessionId}.${signature}`;
}

function verifySignedSessionId(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  const separatorIndex = rawValue.lastIndexOf(".");
  if (separatorIndex <= 0) {
    return null;
  }

  const sessionId = rawValue.slice(0, separatorIndex);
  const providedSignature = rawValue.slice(separatorIndex + 1);
  const expectedSignature = createHmac("sha256", serverConfig.sessionSecret)
    .update(sessionId)
    .digest("base64url");

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  return sessionId;
}

export class AnonymousSessionManager {
  constructor(private readonly persistence: ServerPersistence) {}

  private buildFingerprint(request: Request) {
    const ipBucket = getIpBucket(request.ip || request.socket.remoteAddress || "unknown");
    const userAgent = request.get("user-agent")?.trim() || "unknown";

    return createHmac("sha256", serverConfig.sessionSecret)
      .update(`${ipBucket}|${userAgent}`)
      .digest("hex");
  }

  private pruneFingerprintRecord(record: FingerprintRecord, now: number) {
    record.issuedAtTimestamps = record.issuedAtTimestamps.filter(
      (timestamp) => now - timestamp < NEW_SESSION_WINDOW_MS,
    );

    if (record.issuedAtTimestamps.length === 0) {
      record.lastIssuedSessionId = null;
    }
  }

  private issueSessionIdForFingerprint(request: Request, now: number) {
    const fingerprint = this.buildFingerprint(request);
    const record = this.persistence.loadFingerprintRecord(fingerprint) ?? {
      issuedAtTimestamps: [],
      lastIssuedSessionId: null,
    };

    this.pruneFingerprintRecord(record, now);

    const shouldReuseExistingSession =
      !!record.lastIssuedSessionId &&
      record.issuedAtTimestamps.length >= NEW_SESSION_REUSE_THRESHOLD;

    const sessionId = shouldReuseExistingSession
      ? record.lastIssuedSessionId!
      : randomUUID();

    record.issuedAtTimestamps.push(now);
    record.lastIssuedSessionId = sessionId;
    this.persistence.saveFingerprintRecord(fingerprint, record);

    return sessionId;
  }

  private setSessionCookie(response: Response, sessionId: string) {
    response.cookie(serverConfig.sessionCookieName, signSessionId(sessionId), {
      httpOnly: true,
      maxAge: serverConfig.sessionCookieMaxAgeMs,
      sameSite: "lax",
      secure: serverConfig.useSecureCookies,
    });
  }

  resolveSession(request: Request, response: Response, now = Date.now()) {
    const cookies = parseCookieHeader(request.headers.cookie);
    const verifiedSessionId = verifySignedSessionId(
      cookies.get(serverConfig.sessionCookieName),
    );

    if (verifiedSessionId) {
      return {
        isNewSession: false,
        sessionId: verifiedSessionId,
      };
    }

    const sessionId = this.issueSessionIdForFingerprint(request, now);
    this.setSessionCookie(response, sessionId);

    return {
      isNewSession: true,
      sessionId,
    };
  }
}

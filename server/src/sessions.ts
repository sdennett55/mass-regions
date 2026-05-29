import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

import { serverConfig } from "./config.ts";

const SESSION_TOKEN_HEADER = "x-session-token";

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

function getQueryStringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
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
  private setSessionCookie(response: Response, sessionId: string) {
    response.cookie(serverConfig.sessionCookieName, signSessionId(sessionId), {
      httpOnly: true,
      maxAge: serverConfig.sessionCookieMaxAgeMs,
      sameSite: serverConfig.sessionCookieSameSite,
      secure: serverConfig.useSecureCookies,
    });
  }

  resolveExistingSession(request: Request, response: Response) {
    const cookies = parseCookieHeader(request.headers.cookie);
    const verifiedSessionId =
      verifySignedSessionId(request.get(SESSION_TOKEN_HEADER)) ??
      verifySignedSessionId(getQueryStringValue(request.query.sessionToken)) ??
      verifySignedSessionId(cookies.get(serverConfig.sessionCookieName));

    if (verifiedSessionId) {
      this.setSessionCookie(response, verifiedSessionId);
      return {
        isNewSession: false,
        sessionId: verifiedSessionId,
        sessionToken: signSessionId(verifiedSessionId),
      };
    }

    return null;
  }

  resolveSession(request: Request, response: Response) {
    const existingSession = this.resolveExistingSession(request, response);

    if (existingSession) {
      return existingSession;
    }

    const sessionId = randomUUID();
    this.setSessionCookie(response, sessionId);

    return {
      isNewSession: true,
      sessionId,
      sessionToken: signSessionId(sessionId),
    };
  }
}

import { randomUUID } from "node:crypto"

import { serverConfig } from "./config.ts"

type TurnstileVerificationResult = {
  errorCodes: string[]
  ok: boolean
}

type TurnstileSiteVerifyResponse = {
  "error-codes"?: string[]
  success?: boolean
}

const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export async function verifyTurnstileToken(
  token: string,
  remoteIp: string,
): Promise<TurnstileVerificationResult> {
  if (!serverConfig.turnstileEnabled || !serverConfig.turnstileSecretKey) {
    return {
      errorCodes: [],
      ok: true,
    }
  }

  try {
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        remoteip: remoteIp,
        response: token,
        secret: serverConfig.turnstileSecretKey,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    })

    if (!response.ok) {
      return {
        errorCodes: ["siteverify-http-error"],
        ok: false,
      }
    }

    const payload = (await response.json()) as TurnstileSiteVerifyResponse

    return {
      errorCodes: Array.isArray(payload["error-codes"]) ? payload["error-codes"] : [],
      ok: payload.success === true,
    }
  } catch {
    return {
      errorCodes: ["siteverify-network-error"],
      ok: false,
    }
  }
}

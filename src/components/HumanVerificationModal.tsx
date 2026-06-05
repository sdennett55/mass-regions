import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      remove?: (widgetId: string) => void;
      render: (
        container: HTMLElement,
        options: {
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          sitekey: string;
          theme?: "auto" | "dark" | "light";
        },
      ) => string;
      reset?: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile-script";
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile is unavailable."));
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      TURNSTILE_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    if (existingScript) {
      if (existingScript.dataset.loaded === "1") {
        resolve();
        return;
      }

      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Turnstile failed to load.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = TURNSTILE_SCRIPT_SRC;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error("Turnstile failed to load."));
    document.head.appendChild(script);
  }).catch((error) => {
    turnstileScriptPromise = null;
    throw error;
  });

  return turnstileScriptPromise;
}

type HumanVerificationModalProps = {
  errorMessage?: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onVerify: (token: string) => void;
  siteKey: string | null;
};

function HumanVerificationModal({
  errorMessage = null,
  isOpen,
  isSubmitting,
  onCancel,
  onVerify,
  siteKey,
}: HumanVerificationModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isScriptReady, setIsScriptReady] = useState(false);

  useEffect(() => {
    if (!isOpen || !siteKey) {
      return;
    }

    let isCancelled = false;

    void loadTurnstileScript()
      .then(() => {
        if (isCancelled) {
          return;
        }

        setIsScriptReady(true);
        setLoadError(null);
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : "Human verification could not load.",
        );
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, siteKey]);

  useEffect(() => {
    if (!isOpen || !isScriptReady || !siteKey || !containerRef.current) {
      return;
    }

    const turnstile = window.turnstile;
    if (!turnstile) {
      return;
    }

    const container = containerRef.current;
    container.innerHTML = "";
    widgetIdRef.current = turnstile.render(container, {
      callback(token) {
        onVerify(token);
      },
      "error-callback"() {
        setLoadError("Verification hit an error. Try again.");
      },
      "expired-callback"() {
        setLoadError("Verification expired. Try again.");
      },
      sitekey: siteKey,
      theme: "light",
    });

    return () => {
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
      }

      widgetIdRef.current = null;

      container.innerHTML = "";
    };
  }, [isOpen, isScriptReady, onVerify, siteKey]);

  useEffect(() => {
    if (!isOpen || isSubmitting || !widgetIdRef.current || !window.turnstile?.reset) {
      return;
    }

    if (!errorMessage && !loadError) {
      return;
    }

    window.turnstile.reset(widgetIdRef.current);
  }, [errorMessage, isOpen, isSubmitting, loadError]);

  if (!isOpen) {
    return null;
  }

  const message = loadError ?? errorMessage;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-slate-950/36 px-3 backdrop-blur-[1.5px]">
      <div className="w-[min(26rem,100%)] overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.2)]">
        <div className="border-b border-slate-200/80 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Quick Check
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-950">
            Verify you&apos;re human
          </p>
          <p className="mt-1 text-sm font-medium text-slate-600">
            This helps slow down VPN rotation and scripted attacks without adding accounts.
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-2xl bg-slate-100/90 px-4 py-4">
            {isScriptReady && siteKey ? (
              <div ref={containerRef} className="min-h-[68px]" />
            ) : (
              <p className="text-sm font-medium text-slate-600">
                Loading verification...
              </p>
            )}
          </div>

          {message ? (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm font-medium text-amber-900">
              {message}
            </div>
          ) : null}

          {isSubmitting ? (
            <p className="text-sm font-medium text-slate-600">
              Checking your verification…
            </p>
          ) : null}

          <div className="flex justify-end">
            <button
              className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              data-ui-control="true"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HumanVerificationModal;

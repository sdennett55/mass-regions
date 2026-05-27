import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Share2 } from "lucide-react";

const SHARE_FEEDBACK_RESET_MS = 2200;
const SHARE_TITLE = "YOUR REGION NEEDS YOU | Border Beef";
const SHARE_TEXT =
  "Massachusetts is at war. Enlist with your region, capture territories, and help decide who controls the map this week.";

async function copyTextToClipboard(text: string) {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard unavailable.");
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("Copy command failed.");
    }
  } finally {
    document.body.removeChild(textArea);
  }
}

function ShareButton() {
  const shareFeedbackTimerRef = useRef<number | null>(null);
  const [shareStatus, setShareStatus] = useState<
    "idle" | "copied" | "shared" | "error"
  >("idle");

  const shareButtonLabel =
    shareStatus === "copied"
      ? "Copied"
      : shareStatus === "shared"
        ? "Shared"
        : shareStatus === "error"
          ? "Copy failed"
          : "Share";

  useEffect(() => {
    return () => {
      if (shareFeedbackTimerRef.current !== null) {
        window.clearTimeout(shareFeedbackTimerRef.current);
      }
    };
  }, []);

  const scheduleShareStatusReset = () => {
    if (shareFeedbackTimerRef.current !== null) {
      window.clearTimeout(shareFeedbackTimerRef.current);
    }

    shareFeedbackTimerRef.current = window.setTimeout(() => {
      setShareStatus("idle");
      shareFeedbackTimerRef.current = null;
    }, SHARE_FEEDBACK_RESET_MS);
  };

  const handleShareButtonPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleShareButtonClick = async (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();

    if (typeof window === "undefined") {
      return;
    }

    const shareUrl = window.location.href;

    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({
          text: SHARE_TEXT,
          title: SHARE_TITLE,
          url: shareUrl,
        });
        setShareStatus("shared");
        scheduleShareStatusReset();
        return;
      }

      await copyTextToClipboard(`${SHARE_TITLE}\n${SHARE_TEXT}\n${shareUrl}`);
      setShareStatus("copied");
      scheduleShareStatusReset();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setShareStatus("error");
      scheduleShareStatusReset();
    }
  };

  return (
    <div className="pointer-events-auto relative z-10" data-ui-control="true">
      {shareStatus === "copied" ? (
        <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/75 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.16)]">
          Copied
        </span>
      ) : null}
      <button
        aria-label={shareButtonLabel === "Share" ? "Share the war" : shareButtonLabel}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/75 bg-slate-950 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(15,23,42,0.16)] transition hover:bg-slate-800"
        data-ui-control="true"
        onClick={handleShareButtonClick}
        onPointerDown={handleShareButtonPointerDown}
        type="button"
      >
        <Share2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.1} />
      </button>
    </div>
  );
}

export default ShareButton;

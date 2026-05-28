import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useState,
} from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { fetchServerStats } from "../game/serverClient";
import type { ServerStatsSnapshot } from "../game/serverProtocol";

const ADMIN_STATS_POLL_INTERVAL_MS = 5000;
const MOBILE_BREAKPOINT_PX = 640;

function formatUptime(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatUpdatedAt(timestamp: number | null) {
  if (!timestamp) {
    return "Waiting...";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

type StatCardProps = {
  label: string;
  tone?: "neutral" | "good" | "warning";
  value: string;
};

function StatCard({ label, tone = "neutral", value }: StatCardProps) {
  const toneClassName =
    tone === "good"
      ? "bg-emerald-400/10 text-emerald-100 ring-1 ring-emerald-300/15"
      : tone === "warning"
        ? "bg-amber-300/12 text-amber-50 ring-1 ring-amber-200/15"
        : "bg-white/6 text-white ring-1 ring-white/10";

  return (
    <div className={`rounded-2xl px-3 py-2 ${toneClassName}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function AdminStatsPanel() {
  const [stats, setStats] = useState<ServerStatsSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.innerWidth < MOBILE_BREAKPOINT_PX;
  });

  useEffect(() => {
    let isCancelled = false;
    let pollTimeoutId: number | null = null;
    let activeController: AbortController | null = null;

    const scheduleNextPoll = () => {
      pollTimeoutId = window.setTimeout(() => {
        void loadStats();
      }, ADMIN_STATS_POLL_INTERVAL_MS);
    };

    const loadStats = async () => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const nextStats = await fetchServerStats(controller.signal);
        if (isCancelled) {
          return;
        }

        setStats(nextStats);
        setErrorMessage(null);
        setLastUpdatedAt(Date.now());
      } catch (error) {
        if (
          isCancelled ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load stats.",
        );
      } finally {
        if (!isCancelled) {
          scheduleNextPoll();
        }
      }
    };

    void loadStats();

    return () => {
      isCancelled = true;
      activeController?.abort();

      if (pollTimeoutId !== null) {
        window.clearTimeout(pollTimeoutId);
      }
    };
  }, []);

  const handleToggleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsCollapsed((currentState) => !currentState);
  };

  const hasWarningState =
    !!stats &&
    (stats.actions.sessionSyncErrors > 0 || stats.actions.rejected > 0);

  return (
    <aside
      className="pointer-events-auto w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-white/15 bg-slate-950/90 text-white shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur"
      data-ui-control="true"
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
            Admin
          </p>
          <p className="text-sm font-semibold text-white">Live Server Stats</p>
          <p className="mt-0.5 text-xs font-medium text-white/60">
            Updated {formatUpdatedAt(lastUpdatedAt)}
          </p>
        </div>

        <button
          aria-expanded={!isCollapsed}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/12 bg-white/6 text-white transition hover:bg-white/10"
          data-ui-control="true"
          onClick={handleToggleClick}
          type="button"
        >
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4" strokeWidth={2.1} />
          ) : (
            <ChevronUp className="h-4 w-4" strokeWidth={2.1} />
          )}
        </button>
      </div>

      {isCollapsed ? null : (
        <div className="space-y-3 px-4 py-3">
          {errorMessage ? (
            <div className="rounded-2xl border border-amber-300/15 bg-amber-300/10 px-3 py-2 text-sm font-medium text-amber-50">
              {errorMessage}
            </div>
          ) : null}

          {stats ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  label="SSE Live"
                  tone="good"
                  value={stats.sse.activeConnections.toLocaleString()}
                />
                <StatCard
                  label="SSE Peak"
                  value={stats.sse.peakConnections.toLocaleString()}
                />
                <StatCard
                  label="Actions / Min"
                  tone={stats.actions.lastMinute > 0 ? "good" : "neutral"}
                  value={stats.actions.lastMinute.toLocaleString()}
                />
                <StatCard
                  label="Avg Action"
                  value={`${stats.actions.averageLatencyMs.toLocaleString()} ms`}
                />
                <StatCard
                  label="State / Min"
                  value={stats.requests.stateLastMinute.toLocaleString()}
                />
                <StatCard
                  label="Sync Errors"
                  tone={stats.actions.sessionSyncErrors > 0 ? "warning" : "neutral"}
                  value={stats.actions.sessionSyncErrors.toLocaleString()}
                />
                <StatCard
                  label="Heap"
                  value={`${stats.memory.heapUsedMb.toLocaleString()} MB`}
                />
                <StatCard
                  label="RSS"
                  value={`${stats.memory.rssMb.toLocaleString()} MB`}
                />
              </div>

              <div className="rounded-2xl bg-white/6 px-3 py-3 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-3 text-sm font-medium text-white/85">
                  <span>Uptime</span>
                  <span className="tabular-nums">
                    {formatUptime(stats.uptimeSeconds)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm font-medium text-white/85">
                  <span>Total Actions</span>
                  <span className="tabular-nums">
                    {stats.actions.total.toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm font-medium text-white/85">
                  <span>Rejected Actions</span>
                  <span className="tabular-nums">
                    {stats.actions.rejected.toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm font-medium text-white/85">
                  <span>State Requests</span>
                  <span className="tabular-nums">
                    {stats.requests.stateTotal.toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm font-medium text-white/85">
                  <span>SSE Attempts / Min</span>
                  <span className="tabular-nums">
                    {stats.sse.connectionAttemptsLastMinute.toLocaleString()}
                  </span>
                </div>
              </div>

              <p
                className={`text-[11px] font-medium ${
                  hasWarningState ? "text-amber-100/90" : "text-white/55"
                }`}
              >
                {hasWarningState
                  ? "Warnings are non-zero. Worth checking live traffic or recent deploy behavior."
                  : "Polling /api/stats every 5 seconds."}
              </p>
            </>
          ) : (
            <div className="rounded-2xl bg-white/6 px-3 py-3 text-sm font-medium text-white/70 ring-1 ring-white/10">
              Loading stats...
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

export default AdminStatsPanel;

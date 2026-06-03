import {
  type FormEvent as ReactFormEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useState,
} from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import {
  clearServerIpTimeout,
  createServerIpTimeout,
  fetchServerStats,
} from "../game/serverClient";
import type { ServerStatsSnapshot } from "../game/serverProtocol";

const ADMIN_STATS_POLL_INTERVAL_MS = 5000;
const MOBILE_BREAKPOINT_PX = 640;
const ADMIN_STATS_TOKEN_STORAGE_KEY = "mass-regions:admin-stats-token";

function loadStoredAdminStatsToken() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const token = window.sessionStorage.getItem(ADMIN_STATS_TOKEN_STORAGE_KEY);
    return token?.trim() ? token : null;
  } catch {
    return null;
  }
}

function persistAdminStatsToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(ADMIN_STATS_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage failures so the current tab can still use the token in memory.
  }
}

function clearStoredAdminStatsToken() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(ADMIN_STATS_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures so clearing still works for the current tab.
  }
}

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

function formatTimeoutEnd(timestamp: number | null) {
  if (!timestamp) {
    return "Config block";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
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
  const [adminStatsToken, setAdminStatsToken] = useState<string | null>(() =>
    loadStoredAdminStatsToken(),
  );
  const [adminStatsTokenDraft, setAdminStatsTokenDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [moderatingIp, setModeratingIp] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.innerWidth < MOBILE_BREAKPOINT_PX;
  });

  useEffect(() => {
    if (!adminStatsToken) {
      return;
    }

    let isCancelled = false;
    let shouldScheduleNextPoll = true;
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
        const nextStats = await fetchServerStats(
          controller.signal,
          adminStatsToken,
        );
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

        if (
          error instanceof Error &&
          error.message === "Admin token required."
        ) {
          shouldScheduleNextPoll = false;
          clearStoredAdminStatsToken();
          setAdminStatsToken(null);
          setStats(null);
          setLastUpdatedAt(null);
          setErrorMessage("Enter a valid admin token.");
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load stats.",
        );
      } finally {
        if (!isCancelled && shouldScheduleNextPoll) {
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
  }, [adminStatsToken]);

  const handleToggleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsCollapsed((currentState) => !currentState);
  };

  const handleAdminTokenSubmit = (
    event:
      | ReactMouseEvent<HTMLButtonElement>
      | ReactFormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const trimmedToken = adminStatsTokenDraft.trim();
    if (!trimmedToken) {
      setErrorMessage("Enter your admin token.");
      return;
    }

    persistAdminStatsToken(trimmedToken);
    setAdminStatsToken(trimmedToken);
    setErrorMessage(null);
  };

  const handleClearAdminAccess = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    clearStoredAdminStatsToken();
    setAdminStatsToken(null);
    setAdminStatsTokenDraft("");
    setStats(null);
    setLastUpdatedAt(null);
    setErrorMessage(null);
  };

  const handleBlockIp = async (ip: string) => {
    if (!adminStatsToken) {
      return;
    }

    setModeratingIp(ip);
    try {
      const result = await createServerIpTimeout(ip, adminStatsToken, 24 * 60);
      setStats((currentStats) =>
        currentStats
          ? {
              ...currentStats,
              moderation: result.moderation,
            }
          : currentStats,
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to time out that IP.",
      );
    } finally {
      setModeratingIp(null);
    }
  };

  const handleClearIpTimeout = async (ip: string) => {
    if (!adminStatsToken) {
      return;
    }

    setModeratingIp(ip);
    try {
      const result = await clearServerIpTimeout(ip, adminStatsToken);
      setStats((currentStats) =>
        currentStats
          ? {
              ...currentStats,
              moderation: result.moderation,
            }
          : currentStats,
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to clear that timeout.",
      );
    } finally {
      setModeratingIp(null);
    }
  };

  const hasWarningState =
    !!stats &&
    (stats.actions.sessionSyncErrors > 0 || stats.actions.rejected > 0);

  return (
    <aside
      className="pointer-events-auto flex w-[min(19rem,calc(100vw-1.5rem))] min-h-0 flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-950/90 text-white shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur"
      data-ui-control="true"
      style={{
        maxHeight:
          "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 4.5rem)",
      }}
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
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {!adminStatsToken ? (
            <form
              className="space-y-3 rounded-2xl bg-white/6 px-3 py-3 ring-1 ring-white/10"
              data-ui-control="true"
              onSubmit={handleAdminTokenSubmit}
            >
              <div>
                <p className="text-sm font-semibold text-white">
                  Admin token required
                </p>
                <p className="mt-1 text-xs font-medium text-white/60">
                  Enter the server token to unlock live stats for this tab.
                </p>
              </div>

              <input
                autoCapitalize="none"
                autoComplete="off"
                className="w-full rounded-2xl border border-white/12 bg-slate-950/70 px-3 py-2 text-sm font-medium text-white outline-none placeholder:text-white/35 focus:border-white/30"
                data-ui-control="true"
                onChange={(event) => setAdminStatsTokenDraft(event.target.value)}
                placeholder="Admin token"
                spellCheck={false}
                type="password"
                value={adminStatsTokenDraft}
              />

              <button
                className="w-full cursor-pointer rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                data-ui-control="true"
                type="submit"
              >
                Unlock Stats
              </button>
            </form>
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-amber-300/15 bg-amber-300/10 px-3 py-2 text-sm font-medium text-amber-50">
              {errorMessage}
            </div>
          ) : null}

          {stats && adminStatsToken ? (
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
                <StatCard
                  label="Blocked IPs"
                  tone={stats.moderation.activeBlockedIps > 0 ? "warning" : "neutral"}
                  value={stats.moderation.activeBlockedIps.toLocaleString()}
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

              <div className="rounded-2xl bg-white/6 px-3 py-3 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Hot IPs
                    </p>
                    <p className="mt-1 text-xs font-medium text-white/60">
                      New sessions are tracked over 15 minutes. Actions are tracked over 10.
                    </p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                    Admin only
                  </span>
                </div>

                {stats.moderation.hotIps.length ? (
                  <div className="mt-3 space-y-2">
                    {stats.moderation.hotIps.map((entry) => {
                      const isBusy = moderatingIp === entry.ip;
                      const isConfigBlocked =
                        entry.isBlocked && entry.blockedUntil === null;
                      const isHighActionIp = entry.actionCountLastWindow > 20;
                      return (
                        <div
                          key={entry.ip}
                          className="rounded-2xl bg-slate-950/40 px-3 py-3 ring-1 ring-white/8"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className={`truncate text-sm font-semibold ${
                                  isHighActionIp ? "text-rose-300" : "text-white"
                                }`}
                              >
                                {entry.ip}
                              </p>
                              <p className="mt-1 text-xs font-medium text-white/60">
                                {entry.newSessionsLastWindow} new sessions,{" "}
                                {entry.actionCountLastWindow} actions
                              </p>
                              {entry.isBlocked ? (
                                <p className="mt-1 text-xs font-medium text-amber-100/90">
                                  {entry.blockReason ?? "Timed out"} until{" "}
                                  {formatTimeoutEnd(entry.blockedUntil)}
                                </p>
                              ) : null}
                            </div>

                            <button
                              className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                                entry.isBlocked
                                  ? "border border-emerald-300/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/18"
                                  : "border border-amber-300/20 bg-amber-300/10 text-amber-50 hover:bg-amber-300/18"
                              }`}
                              data-ui-control="true"
                              disabled={isBusy || isConfigBlocked}
                              onClick={() =>
                                entry.isBlocked
                                  ? void handleClearIpTimeout(entry.ip)
                                  : void handleBlockIp(entry.ip)
                              }
                              type="button"
                            >
                              {isConfigBlocked
                                ? "Config"
                                : isBusy
                                ? "Working..."
                                : entry.isBlocked
                                  ? "Clear"
                                  : "Block 24h"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm font-medium text-white/65">
                    No recent IP spikes.
                  </p>
                )}
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

              <button
                className="w-full cursor-pointer rounded-2xl border border-white/12 bg-white/6 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                data-ui-control="true"
                onClick={handleClearAdminAccess}
                type="button"
              >
                Lock Stats
              </button>
            </>
          ) : adminStatsToken ? (
            <div className="rounded-2xl bg-white/6 px-3 py-3 text-sm font-medium text-white/70 ring-1 ring-white/10">
              Loading stats...
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}

export default AdminStatsPanel;

import { Shield, Sword, X } from "lucide-react";

import {
  formatTownLabel,
  getRegionColor,
  type RegionName,
} from "../data/massRegions";
import {
  CAPTURE_POINTS_TO_CAPTURE,
  PLAYER_ACTION_COST,
} from "../game/constants";
import { formatDurationShort } from "../game/logic";
import type { TownBattleState } from "../game/types";

type TownBattlePanelProps = {
  battleState: TownBattleState;
  captureProtectionRemaining: number;
  controlCount: number;
  actionPoints: number | null;
  isCaptureProtected: boolean;
  onClose: () => void;
  onDefend: () => void;
  onInvade: (region: RegionName) => void;
  statusMessage: string | null;
  validInvadingRegions: RegionName[];
};

function TownBattlePanel({
  battleState,
  captureProtectionRemaining,
  controlCount,
  actionPoints,
  isCaptureProtected,
  onClose,
  onDefend,
  onInvade,
  statusMessage,
  validInvadingRegions,
}: TownBattlePanelProps) {
  const hasActionPointState = actionPoints !== null;
  const canAct = hasActionPointState && actionPoints >= PLAYER_ACTION_COST;
  const canDefend = canAct && battleState.isContested && !isCaptureProtected;
  const contestPercent = `${(battleState.captureProgress / CAPTURE_POINTS_TO_CAPTURE) * 100}%`;
  const lockedAttackerRegion =
    battleState.isContested && !isCaptureProtected
      ? battleState.contestingRegion
      : null;
  const defendLabel = isCaptureProtected
    ? "Protected"
    : battleState.isContested
      ? `Defend ${battleState.currentRegion}`
      : "No invasion to defend";
  const defendStatusLabel = isCaptureProtected
    ? "Protected"
    : !hasActionPointState && battleState.isContested
      ? "Syncing"
    : !canAct && battleState.isContested
      ? "No points"
      : null;

  return (
    <aside
      className="pointer-events-auto absolute z-10 w-[min(26rem,calc(100vw-1.5rem))] cursor-default select-text overflow-hidden rounded-3xl border border-white/75 bg-white/94 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur"
      data-ui-control="true"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
        left: "calc(env(safe-area-inset-left, 0px) + 0.75rem)",
      }}
    >
      <div className="border-b border-slate-200/80 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Territory
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              {formatTownLabel(battleState.townName)}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
              <span
                className="rounded-full px-2.5 py-1 text-slate-950"
                style={{
                  backgroundColor: `${getRegionColor(battleState.currentRegion)}cc`,
                }}
              >
                {battleState.currentRegion}
              </span>
              {battleState.currentRegion !== battleState.baselineRegion ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                  Formerly {battleState.baselineRegion}
                </span>
              ) : null}
              <span
                className={`rounded-full px-2.5 py-1 ${
                  isCaptureProtected
                    ? "bg-sky-100 text-sky-800"
                    : battleState.isContested
                      ? "bg-rose-100 text-rose-800"
                      : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {isCaptureProtected
                  ? "Captured"
                  : battleState.isContested
                    ? "Contested"
                    : "Secure"}
              </span>
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {battleState.currentRegion} currently controls {controlCount}{" "}
              territories.
            </p>
          </div>

          <button
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
            data-ui-control="true"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" strokeWidth={2.1} />
          </button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div>
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <span>Capture meter</span>
            <span>
              {battleState.captureProgress}/{CAPTURE_POINTS_TO_CAPTURE}
            </span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition ${
                isCaptureProtected
                  ? "bg-sky-500"
                  : battleState.isContested
                    ? "bg-rose-500"
                    : "bg-slate-300"
              }`}
              style={{ width: contestPercent }}
            />
          </div>
          {isCaptureProtected || battleState.isContested ? (
            <p className="mt-2 text-sm font-medium text-slate-700">
              {isCaptureProtected
                ? "Protected after capture."
                : `${battleState.contestingRegion} is attemping to capture this territory!`}
            </p>
          ) : null}
        </div>

        {isCaptureProtected ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm font-medium text-sky-900">
            Capture cooldown active.
            {` Reopens in ${formatDurationShort(captureProtectionRemaining)}.`}
          </div>
        ) : null}

        <div className="space-y-3">
          <button
            className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition ${
              canDefend
                ? "border-sky-500 bg-sky-500/14 text-sky-950 shadow-[0_10px_24px_rgba(14,165,233,0.12)] enabled:cursor-pointer enabled:hover:border-sky-400 enabled:hover:bg-sky-500/22"
                : "border-slate-200 bg-slate-100 text-slate-400 disabled:cursor-not-allowed"
            }`}
            data-ui-control="true"
            disabled={!canDefend}
            onClick={onDefend}
            type="button"
          >
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4 shrink-0" strokeWidth={2.1} />
              <span
                className="h-3 w-3 shrink-0 rounded-full bg-white/90 shadow-inner shadow-black/10"
                style={{
                  backgroundColor: getRegionColor(battleState.currentRegion),
                }}
              />
              {defendLabel}
            </span>
            {defendStatusLabel ? (
              <span
                className={`shrink-0 text-xs ${
                  canDefend ? "text-sky-700" : "text-slate-500"
                }`}
              >
                {defendStatusLabel}
              </span>
            ) : null}
          </button>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Choose attacker
            </p>
            {validInvadingRegions.length ? (
              <div className="grid gap-2">
                {validInvadingRegions.map((region) => {
                  const isLockedOut =
                    !!lockedAttackerRegion && lockedAttackerRegion !== region;
                  const canCaptureForRegion =
                    canAct && !isCaptureProtected && !isLockedOut;
                  const attackStatusLabel = isCaptureProtected
                    ? "Protected"
                    : !hasActionPointState
                      ? "Syncing"
                    : !canAct
                      ? "No points"
                    : isLockedOut
                      ? "Locked"
                      : null;

                  return (
                    <button
                      key={region}
                      className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition ${
                        canCaptureForRegion
                          ? "border-rose-500 bg-rose-500/14 text-rose-900 shadow-[0_10px_24px_rgba(225,29,72,0.12)] enabled:cursor-pointer enabled:hover:bg-rose-500/22 enabled:hover:border-rose-400"
                          : "border-slate-200 bg-slate-100 text-slate-400 disabled:cursor-not-allowed"
                      }`}
                      data-ui-control="true"
                      disabled={!canCaptureForRegion}
                      onClick={() => onInvade(region)}
                      type="button"
                    >
                      <span className="flex items-center gap-2">
                        <Sword className="h-4 w-4 shrink-0" strokeWidth={2.1} />
                        <span
                          className="h-3 w-3 shrink-0 rounded-full bg-white/90 shadow-inner shadow-black/10"
                          style={{ backgroundColor: getRegionColor(region) }}
                        />
                        Attack for {region}
                      </span>
                      {attackStatusLabel ? (
                        <span
                          className={`shrink-0 text-xs ${
                            canCaptureForRegion
                              ? "text-rose-700"
                              : "text-slate-500"
                          }`}
                        >
                          {attackStatusLabel}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-sm font-medium text-slate-500">
                No frontline access yet.
              </div>
            )}
          </div>
        </div>

        {statusMessage ? (
          <p className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
            {statusMessage}
          </p>
        ) : null}
      </div>
    </aside>
  );
}

export default TownBattlePanel;

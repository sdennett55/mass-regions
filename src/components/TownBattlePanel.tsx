import { X } from "lucide-react";

import {
  formatTownLabel,
  getRegionColor,
  type RegionName,
} from "../data/massRegions";
import {
  CAPTURE_POINTS_TO_CAPTURE,
  PLAYER_ACTION_COST,
  PLAYER_MAX_ACTION_POINTS,
} from "../game/constants";
import { formatDurationShort } from "../game/logic";
import type { TownBattleState, TownName } from "../game/types";

type TownBattlePanelProps = {
  battleState: TownBattleState;
  captureProtectionRemaining: number;
  controlCount: number;
  actionPoints: number;
  isCaptureProtected: boolean;
  neighboringTowns: TownName[];
  nextActionPointIn: number;
  onClose: () => void;
  onDefend: () => void;
  onDismissSpendFeedback: () => void;
  onInvade: (region: RegionName) => void;
  spendFeedbackKey: number | null;
  statusMessage: string | null;
  validInvadingRegions: RegionName[];
};

function TownBattlePanel({
  battleState,
  captureProtectionRemaining,
  controlCount,
  actionPoints,
  isCaptureProtected,
  neighboringTowns,
  nextActionPointIn,
  onClose,
  onDefend,
  onDismissSpendFeedback,
  onInvade,
  spendFeedbackKey,
  statusMessage,
  validInvadingRegions,
}: TownBattlePanelProps) {
  const canAct = actionPoints >= PLAYER_ACTION_COST;
  const canDefend = canAct && battleState.isContested && !isCaptureProtected;
  const contestPercent = `${(battleState.captureProgress / CAPTURE_POINTS_TO_CAPTURE) * 100}%`;
  const lockedAttackerRegion =
    battleState.isContested && !isCaptureProtected
      ? battleState.contestingRegion
      : null;
  const defendLabel = isCaptureProtected
    ? "Protected"
    : battleState.isContested
      ? `Defend ${battleState.currentRegion} (-1)`
      : "No invasion to defend";

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
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
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
          <p className="mt-2 text-sm font-medium text-slate-700">
            {isCaptureProtected
              ? "Protected after capture."
              : battleState.isContested && battleState.contestingRegion
                ? `${battleState.contestingRegion} is attemping to capture this town.`
                : "No active invasion."}
          </p>
        </div>

        {isCaptureProtected ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm font-medium text-sky-900">
            Capture cooldown active.
            {` Reopens in ${formatDurationShort(captureProtectionRemaining)}.`}
          </div>
        ) : null}

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Neighbors
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-medium text-slate-700">
            {neighboringTowns.length ? (
              neighboringTowns.map((townName) => (
                <p key={townName}>{formatTownLabel(townName)}</p>
              ))
            ) : (
              <p className="col-span-2 text-slate-500">
                No direct land neighbors.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950 px-3 py-3 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                Action Points
              </p>
              <div className="mt-1 flex items-center gap-2">
                <p
                  key={spendFeedbackKey ?? 0}
                  className={`text-lg font-semibold ${
                    spendFeedbackKey !== null ? "action-points-spent" : ""
                  }`}
                  onAnimationEnd={
                    spendFeedbackKey !== null ? onDismissSpendFeedback : undefined
                  }
                >
                  {actionPoints}/{PLAYER_MAX_ACTION_POINTS}
                </p>
              </div>
            </div>
            <p className="text-right text-xs font-medium text-slate-300">
              {nextActionPointIn > 0
                ? `+1 in ${formatDurationShort(nextActionPointIn)}`
                : "At max points"}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            className="w-full rounded-2xl bg-slate-950 px-3 py-3 text-sm font-semibold text-white transition enabled:cursor-pointer enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            data-ui-control="true"
            disabled={!canDefend}
            onClick={onDefend}
            type="button"
          >
            {defendLabel}
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

                  return (
                    <button
                      key={region}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-3 text-left text-sm font-semibold text-slate-950 transition enabled:cursor-pointer enabled:hover:border-slate-300 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                      data-ui-control="true"
                      disabled={!canCaptureForRegion}
                      onClick={() => onInvade(region)}
                      type="button"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full shadow-inner shadow-black/10"
                          style={{ backgroundColor: getRegionColor(region) }}
                        />
                        Capture for {region}
                      </span>
                      <span className="text-xs text-slate-500">
                        {isCaptureProtected ? "Protected" : isLockedOut ? "Locked" : "-1"}
                      </span>
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

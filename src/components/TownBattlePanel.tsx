import { X } from "lucide-react";

import {
  formatTownLabel,
  getRegionColor,
  type RegionName,
} from "../data/massRegions";
import { PLAYER_ACTION_COST } from "../game/constants";
import { formatDurationShort } from "../game/logic";
import type {
  InfluenceBreakdownEntry,
  TownBattleState,
  TownName,
} from "../game/types";

type TownBattlePanelProps = {
  battleState: TownBattleState;
  captureProtectionRemaining: number;
  controlCount: number;
  influenceBreakdown: InfluenceBreakdownEntry[];
  influencePoints: number;
  isCaptureProtected: boolean;
  neighboringTowns: TownName[];
  nextInfluenceIn: number;
  onClose: () => void;
  onDismissSpendFeedback: () => void;
  onDestabilize: () => void;
  onInvade: (region: RegionName) => void;
  onReinforce: () => void;
  spendFeedbackKey: number | null;
  statusMessage: string | null;
  validInvadingRegions: RegionName[];
};

function TownBattlePanel({
  battleState,
  captureProtectionRemaining,
  controlCount,
  influenceBreakdown,
  influencePoints,
  isCaptureProtected,
  neighboringTowns,
  nextInfluenceIn,
  onClose,
  onDismissSpendFeedback,
  onDestabilize,
  onInvade,
  onReinforce,
  spendFeedbackKey,
  statusMessage,
  validInvadingRegions,
}: TownBattlePanelProps) {
  const canAct = influencePoints >= PLAYER_ACTION_COST;
  const canContestTown = !isCaptureProtected;
  const stabilityPercent = `${Math.max(0, Math.min(100, battleState.stability))}%`;

  return (
    <aside
      className="pointer-events-auto absolute z-10 w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-white/75 bg-white/94 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur"
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
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {isCaptureProtected
                  ? "Captured"
                  : battleState.isContested
                    ? "Contested"
                    : "Stable"}
              </span>
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {battleState.currentRegion} currently controls {controlCount}{" "}
              territories.
            </p>
          </div>

          <button
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
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
            <span>Stability</span>
            <span>{Math.round(battleState.stability)}/100</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition ${
                battleState.stability <= 32
                  ? "bg-rose-500"
                  : battleState.stability <= 56
                    ? "bg-amber-400"
                    : "bg-emerald-500"
              }`}
              style={{ width: stabilityPercent }}
            />
          </div>
        </div>

        {isCaptureProtected ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm font-medium text-sky-900">
            Capture cooldown active.
            {` Reopens in ${formatDurationShort(captureProtectionRemaining)}.`}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Influence
            </p>
            <div className="mt-2 space-y-2">
              {influenceBreakdown.map((entry) => (
                <div key={entry.region}>
                  <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-700">
                    <span className="truncate">{entry.region}</span>
                    <span>{entry.influence}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full transition"
                      style={{
                        backgroundColor: getRegionColor(entry.region),
                        width: `${Math.max(6, entry.share * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

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
        </div>

        <div className="rounded-2xl bg-slate-950 px-3 py-3 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                Influence Points
              </p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-lg font-semibold">{influencePoints}/20</p>
                {spendFeedbackKey !== null ? (
                  <span
                    key={spendFeedbackKey}
                    aria-hidden="true"
                    className="influence-spend-burst pointer-events-none inline-flex rounded-full bg-rose-500/18 px-2 py-0.5 text-xs font-semibold text-rose-200"
                    onAnimationEnd={onDismissSpendFeedback}
                  >
                    -1
                  </span>
                ) : null}
              </div>
            </div>
            <p className="text-right text-xs font-medium text-slate-300">
              {nextInfluenceIn > 0
                ? `+1 in ${formatDurationShort(nextInfluenceIn)}`
                : "At max influence"}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            className="w-full rounded-2xl bg-slate-950 px-3 py-3 text-sm font-semibold text-white transition enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            data-ui-control="true"
            disabled={!canAct}
            onClick={onReinforce}
            type="button"
          >
            Reinforce {battleState.currentRegion} (-1)
          </button>

          <button
            className="w-full rounded-2xl bg-amber-500 px-3 py-3 text-sm font-semibold text-slate-950 transition enabled:hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            data-ui-control="true"
            disabled={!canAct || !canContestTown}
            onClick={onDestabilize}
            type="button"
          >
            {isCaptureProtected ? "Cooldown active" : "Destabilize (-1)"}
          </button>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Valid invasions
            </p>
            {!canContestTown ? (
              <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50 px-3 py-3 text-sm font-medium text-sky-900">
                This town is protected until the capture cooldown ends.
              </div>
            ) : validInvadingRegions.length ? (
              <div className="grid gap-2">
                {validInvadingRegions.map((region) => (
                  <button
                    key={region}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-3 text-left text-sm font-semibold text-slate-950 transition enabled:hover:border-slate-300 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                    data-ui-control="true"
                    disabled={!canAct}
                    onClick={() => onInvade(region)}
                    type="button"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full shadow-inner shadow-black/10"
                        style={{ backgroundColor: getRegionColor(region) }}
                      />
                      {region}
                    </span>
                    <span className="text-xs text-slate-500">Invade -1</span>
                  </button>
                ))}
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

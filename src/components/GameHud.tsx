import { PLAYER_MAX_ACTION_POINTS } from "../game/constants"
import { formatDurationShort } from "../game/logic"

type GameHudProps = {
  capturedTownCount: number
  contestedTownCount: number
  actionPoints: number
  nextActionPointIn: number
  seasonLabel: string
  seasonTimeRemaining: number
}

function GameHud({
  capturedTownCount,
  contestedTownCount,
  actionPoints,
  nextActionPointIn,
  seasonLabel,
  seasonTimeRemaining,
}: GameHudProps) {
  return (
    <div
      className="pointer-events-auto absolute z-10 max-w-[min(20rem,calc(100vw-1.5rem))] cursor-default select-text rounded-3xl border border-white/75 bg-slate-950/82 px-4 py-3 text-white shadow-[0_16px_40px_rgba(15,23,42,0.24)] backdrop-blur"
      data-ui-control="true"
      style={{
        right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
        top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            {seasonLabel}
          </p>
          <p className="text-lg font-semibold text-white">
            {formatDurationShort(seasonTimeRemaining)}
          </p>
        </div>

        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            Action Points
          </p>
          <p className="text-lg font-semibold text-white">
            {actionPoints}/{PLAYER_MAX_ACTION_POINTS}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-slate-200">
        <div className="rounded-2xl bg-white/10 px-2 py-2">
          <p className="uppercase tracking-[0.16em] text-slate-300">Next +1</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {nextActionPointIn > 0 ? formatDurationShort(nextActionPointIn) : "Ready"}
          </p>
        </div>

        <div className="rounded-2xl bg-white/10 px-2 py-2">
          <p className="uppercase tracking-[0.16em] text-slate-300">Contested</p>
          <p className="mt-1 text-sm font-semibold text-white">{contestedTownCount}</p>
        </div>

        <div className="rounded-2xl bg-white/10 px-2 py-2">
          <p className="uppercase tracking-[0.16em] text-slate-300">Captured</p>
          <p className="mt-1 text-sm font-semibold text-white">{capturedTownCount}</p>
        </div>
      </div>
    </div>
  )
}

export default GameHud

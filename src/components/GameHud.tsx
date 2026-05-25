import { formatDurationShort } from '../game/logic'

type GameHudProps = {
  contestedTownCount: number
  frontlineTownCount: number
  influencePoints: number
  nextInfluenceIn: number
  seasonLabel: string
  seasonTimeRemaining: number
}

function GameHud({
  contestedTownCount,
  frontlineTownCount,
  influencePoints,
  nextInfluenceIn,
  seasonLabel,
  seasonTimeRemaining,
}: GameHudProps) {
  return (
    <div
      className="pointer-events-none absolute z-10 max-w-[min(20rem,calc(100vw-1.5rem))] rounded-3xl border border-white/75 bg-slate-950/82 px-4 py-3 text-white shadow-[0_16px_40px_rgba(15,23,42,0.24)] backdrop-blur"
      style={{
        right: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)',
        top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
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
            Influence
          </p>
          <p className="text-lg font-semibold text-white">{influencePoints}/20</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-slate-200">
        <div className="rounded-2xl bg-white/10 px-2 py-2">
          <p className="uppercase tracking-[0.16em] text-slate-300">Next +1</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {nextInfluenceIn > 0 ? formatDurationShort(nextInfluenceIn) : 'Ready'}
          </p>
        </div>

        <div className="rounded-2xl bg-white/10 px-2 py-2">
          <p className="uppercase tracking-[0.16em] text-slate-300">Frontlines</p>
          <p className="mt-1 text-sm font-semibold text-white">{frontlineTownCount}</p>
        </div>

        <div className="rounded-2xl bg-white/10 px-2 py-2">
          <p className="uppercase tracking-[0.16em] text-slate-300">Contested</p>
          <p className="mt-1 text-sm font-semibold text-white">{contestedTownCount}</p>
        </div>
      </div>
    </div>
  )
}

export default GameHud

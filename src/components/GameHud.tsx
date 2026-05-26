import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useState,
} from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { PLAYER_MAX_ACTION_POINTS } from '../game/constants'
import { formatDurationShort } from '../game/logic'

type GameHudProps = {
  capturedTownCount: number
  contestedTownCount: number
  actionPoints: number
  compact: boolean
  nextActionPointIn: number
  seasonLabel: string
  seasonTimeRemaining: number
}

function GameHud({
  capturedTownCount,
  contestedTownCount,
  actionPoints,
  compact,
  nextActionPointIn,
  seasonLabel,
  seasonTimeRemaining,
}: GameHudProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleTogglePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleToggleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setIsOpen((currentState) => !currentState)
  }

  const hudContent = (
    <>
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
            {nextActionPointIn > 0 ? formatDurationShort(nextActionPointIn) : 'Ready'}
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
    </>
  )

  if (compact) {
    return (
      <div
        className="pointer-events-none absolute z-10"
        data-ui-control="true"
        style={{
          right: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)',
          top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        }}
      >
        <div
          className="pointer-events-auto relative cursor-default select-text"
          data-ui-control="true"
        >
          <button
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            className="flex h-10 items-center gap-3 rounded-full border border-white/75 bg-slate-950/82 px-3 text-white shadow-[0_16px_40px_rgba(15,23,42,0.24)] backdrop-blur transition hover:bg-slate-950/88"
            data-ui-control="true"
            onClick={handleToggleClick}
            onPointerDown={handleTogglePointerDown}
            type="button"
          >
            <div className="flex items-baseline gap-2 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                Points
              </p>
              <p className="text-sm font-semibold text-white">
                {actionPoints}/{PLAYER_MAX_ACTION_POINTS}
              </p>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-slate-200" strokeWidth={2.1} />
            ) : (
              <ChevronDown
                className="h-4 w-4 shrink-0 text-slate-200"
                strokeWidth={2.1}
              />
            )}
          </button>

          {isOpen ? (
            <div
              className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-3xl border border-white/75 bg-slate-950/82 px-4 py-3 text-white shadow-[0_16px_40px_rgba(15,23,42,0.24)] backdrop-blur"
              data-ui-control="true"
            >
              {hudContent}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className="pointer-events-auto absolute z-10 max-w-[min(20rem,calc(100vw-1.5rem))] cursor-default select-text rounded-3xl border border-white/75 bg-slate-950/82 px-4 py-3 text-white shadow-[0_16px_40px_rgba(15,23,42,0.24)] backdrop-blur"
      data-ui-control="true"
      style={{
        right: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)',
        top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
      }}
    >
      {hudContent}
    </div>
  )
}

export default GameHud

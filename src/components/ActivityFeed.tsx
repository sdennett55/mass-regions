import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Bell } from 'lucide-react'

import { formatTownLabel, getRegionColor } from '../data/massRegions'
import { formatDurationShort } from '../game/logic'
import type { ActivityEvent } from '../game/types'

type ActivityFeedProps = {
  events: ActivityEvent[]
  now: number
  showDismissVeil: boolean
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

function formatActivityTimestamp(timestamp: number, now: number) {
  return `${timeFormatter.format(timestamp)} - ${formatDurationShort(
    Math.max(0, now - timestamp),
  )} ago`
}

function getActivityTitle(event: ActivityEvent) {
  if (event.kind === 'capture') {
    return `${formatTownLabel(event.townName)} captured by ${event.region}`
  }

  if (event.kind === 'total-control') {
    return `${event.region} controls the entire map`
  }

  return `${event.region} now controls 50% of the map`
}

function getActivityDescription(event: ActivityEvent) {
  if (event.kind === 'capture') {
    return null
  }

  if (event.kind === 'total-control') {
    return `${event.territoryTotal} of ${event.territoryTotal} territories`
  }

  return `${event.territoryCount} of ${event.territoryTotal} territories`
}

function ActivityFeed({ events, now, showDismissVeil }: ActivityFeedProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [lastSeenEventId, setLastSeenEventId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const effectiveLastSeenEventId =
    isOpen && events.length > 0 ? events[0].id : lastSeenEventId

  const unreadCount = useMemo(() => {
    if (!events.length) {
      return 0
    }

    if (!effectiveLastSeenEventId) {
      return events.length
    }

    const lastSeenIndex = events.findIndex(
      (event) => event.id === effectiveLastSeenEventId,
    )
    return lastSeenIndex === -1 ? events.length : lastSeenIndex
  }, [effectiveLastSeenEventId, events])

  const handleToggleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    if (events.length) {
      setLastSeenEventId(events[0].id)
    }

    setIsOpen((currentState) => !currentState)
  }

  const handleTogglePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleBackdropPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleBackdropClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setIsOpen(false)
  }

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleWindowPointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) {
        return
      }

      setIsOpen(false)
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('pointerdown', handleWindowPointerDown)
    window.addEventListener('keydown', handleWindowKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown)
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [isOpen])

  return (
    <div
      className={`pointer-events-none absolute ${
        isOpen && showDismissVeil ? 'z-20' : ''
      }`}
      data-ui-control="true"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
        right: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)',
      }}
    >
      <div
        ref={panelRef}
        className="pointer-events-auto relative cursor-default select-text"
        data-ui-control="true"
      >
        {isOpen && showDismissVeil ? (
          <button
            aria-label="Close activity"
            className="fixed inset-0 z-0 cursor-default bg-transparent"
            data-ui-control="true"
            onClick={handleBackdropClick}
            onPointerDown={handleBackdropPointerDown}
            type="button"
          />
        ) : null}

        <button
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label="Activity"
          className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/75 bg-slate-950 text-white shadow-[0_10px_30px_rgba(15,23,42,0.16)] transition hover:bg-slate-800"
          data-ui-control="true"
          onClick={handleToggleClick}
          onPointerDown={handleTogglePointerDown}
          type="button"
        >
          <Bell className="h-4 w-4 shrink-0 text-slate-200" strokeWidth={2.1} />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold leading-5 text-white shadow-[0_4px_12px_rgba(225,29,72,0.35)]">
              {Math.min(unreadCount, 9)}
              {unreadCount > 9 ? '+' : ''}
            </span>
          ) : null}
        </button>

        {isOpen ? (
          <aside
            className="absolute bottom-full right-0 z-20 mb-2 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-white/75 bg-white/94 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur"
            data-ui-control="true"
          >
            <div className="border-b border-slate-200/80 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Activity
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                Major milestones
              </p>
            </div>

            <div className="max-h-[min(20rem,50vh)] overflow-auto px-2 py-2">
              {events.length ? (
                <div className="space-y-2">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="mt-1 h-3 w-3 shrink-0 rounded-full shadow-inner shadow-black/10"
                          style={{ backgroundColor: getRegionColor(event.region) }}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">
                            {getActivityTitle(event)}
                          </p>
                          {getActivityDescription(event) ? (
                            <p className="mt-1 text-xs font-medium text-slate-600">
                              {getActivityDescription(event)}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            {formatActivityTimestamp(event.occurredAt, now)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm font-medium text-slate-500">
                  No major activity yet this session.
                </div>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

export default ActivityFeed

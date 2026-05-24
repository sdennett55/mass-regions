import { regionLegend } from '../data/massRegions'

function RegionLegend() {
  return (
    <aside className="pointer-events-auto max-h-[calc(100vh-1.5rem)] w-[18rem] max-w-[calc(100vw-1.5rem)] overflow-auto rounded-[1.5rem] border border-white/75 bg-white/82 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.16)] backdrop-blur">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        Legend
      </p>

      <ul className="mt-3 space-y-1.5">
        {regionLegend.map(({ region, color }) => (
          <li
            key={region}
            className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
            style={{
              borderColor: `${color}44`,
              backgroundColor: `${color}12`,
            }}
          >
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 rounded-full shadow-inner shadow-black/10"
              style={{ backgroundColor: color }}
            />
            <span className="text-sm font-medium leading-5 text-slate-900">
              {region}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export default RegionLegend

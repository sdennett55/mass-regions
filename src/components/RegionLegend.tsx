import { mappedTownCount, regionLegend } from '../data/massRegions'

function pluralizeTowns(count: number) {
  return `${count} town${count === 1 ? '' : 's'}`
}

function RegionLegend() {
  return (
    <aside className="rounded-[2rem] border border-slate-300/70 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur xl:sticky xl:top-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Legend
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            Massachusetts regions
          </h2>
        </div>
        <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
          {mappedTownCount} municipalities
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">
        Each town path is colored from its SVG id, with numbered multipart ids
        like <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-800">GLOUCESTER2</code>{' '}
        collapsing back to the same town.
      </p>

      <ul className="mt-6 space-y-3">
        {regionLegend.map(({ region, color, townCount }) => (
          <li
            key={region}
            className="flex items-center justify-between rounded-2xl border px-4 py-3"
            style={{
              borderColor: `${color}55`,
              backgroundColor: `${color}14`,
            }}
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-4 w-4 rounded-full shadow-inner shadow-black/10"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm font-semibold text-slate-900">
                {region}
              </span>
            </div>
            <span className="text-xs font-medium text-slate-600">
              {pluralizeTowns(townCount)}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export default RegionLegend

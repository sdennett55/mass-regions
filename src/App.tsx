import Map from './components/Map'
import RegionLegend from './components/RegionLegend'

function App() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7ed,transparent_34%),radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.22),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f8f5ef_100%)] text-slate-950">
      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-10">
        <header className="rounded-[2rem] border border-white/80 bg-white/70 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Mass Regions
          </p>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <h1 className="font-['Iowan_Old_Style','Palatino_Linotype','Book_Antiqua',Georgia,serif] text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Every Massachusetts town, grouped by region.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
                The SVG map reads each town path id, matches it against the
                region mapping, and fills multipart coastal or island towns with
                the same regional color.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="font-semibold text-slate-900">Town ids</p>
                <p className="mt-1">SVG path ids drive the region lookup.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="font-semibold text-slate-900">Legend</p>
                <p className="mt-1">Seventeen region swatches stay in sync.</p>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="rounded-[2rem] border border-slate-300/70 bg-white/85 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
            <div className="flex flex-col gap-3 border-b border-slate-200/80 px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  Regional map
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Unmapped helper ids are ignored automatically, so only real
                  town paths receive region fills.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                Scroll on smaller screens
              </span>
            </div>

            <div className="overflow-x-auto p-4 sm:p-6">
              <div className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,#fdfcf8_0%,#f8fafc_100%)] p-3 shadow-inner shadow-slate-200/70 sm:p-5">
                <Map
                  aria-label="Map of Massachusetts towns colored by region"
                  className="h-auto min-w-[1100px] w-full"
                  role="img"
                />
              </div>
            </div>
          </section>

          <RegionLegend />
        </div>
      </main>
    </div>
  )
}

export default App

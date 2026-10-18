import { aggregateEmergencies } from "@/lib/aggregator";
import type { EmergencyInfo } from "@/lib/emergency-data";

const TYPE_STYLES: Record<string, { badge: string; border: string }> = {
  fire: {
    badge: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
    border: "border-red-200 dark:border-red-900/60",
  },
  weather: {
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    border: "border-sky-200 dark:border-sky-900/60",
  },
  earthquake: {
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-900/60",
  },
  infrastructure: {
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-900/60",
  },
  public_safety: {
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-900/60",
  },
  medical: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-900/60",
  },
  natural_disaster: {
    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300",
    border: "border-yellow-200 dark:border-yellow-900/60",
  },
};

const SEVERITY_BADGES: Record<string, string> = {
  extreme: "bg-red-600 text-white",
  severe: "bg-orange-500 text-white",
  moderate: "bg-amber-500 text-white",
  low: "bg-zinc-500 text-white",
};

const DEFAULT_STYLE = {
  badge: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  border: "border-zinc-200 dark:border-zinc-800",
};

export default async function HubPage() {
  const aggregated = await aggregateEmergencies({
    lat: 34.0224,
    lng: -118.2851,
    radiusMiles: 100,
  });
  const items: EmergencyInfo[] = aggregated.data;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Emergency Data Aggregator & API Hub
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-3 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {aggregated.meta.total} Active Incidents ({aggregated.meta.criticalCount} Critical)
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Live multi-source aggregation from National Weather Service (NWS), USGS Earthquakes, NASA EONET, Local 911 CAD Dispatch, and Citizen Reports.
          </p>
        </header>

        {/* Source Feed Status Bar */}
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {aggregated.meta.sources.map((s) => (
            <div
              key={s.source}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {s.source.replace("_", " ")}
                </span>
                <span
                  className={`h-2 w-2 rounded-full ${
                    s.ok ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                  title={s.error ?? "Feed online"}
                />
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  {s.count}
                </span>
                <span className="text-[11px] text-zinc-400">{s.latencyMs}ms</span>
              </div>
            </div>
          ))}
        </section>

        {/* Retell AI Voice Briefing Preview */}
        <section className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/30 p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Retell AI Live Voice Briefing Preview
            </span>
            <code className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400">
              POST /api/retell/inbound &bull; POST /api/retell/tool
            </code>
          </div>
          <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
            &ldquo;{aggregated.voiceBriefing}&rdquo;
          </p>
        </section>

        {/* UI Incident Cards */}
        <ul className="space-y-4">
          {items.map((item) => {
            const style = TYPE_STYLES[item.type] ?? DEFAULT_STYLE;
            const sevBadge =
              SEVERITY_BADGES[item.severity] ?? SEVERITY_BADGES.low;
            return (
              <li
                key={item.id}
                className={`rounded-xl border bg-white dark:bg-zinc-900 p-5 shadow-xs ${style.border}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${sevBadge}`}
                      >
                        {item.severity}
                      </span>
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style.badge}`}
                      >
                        {item.type.replace("_", " ")}
                      </span>
                      <span className="inline-block rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-600 dark:text-zinc-400">
                        {item.source}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Radius: {item.radiusMiles} mi &bull; Weight:{" "}
                        {item.severityWeight}
                      </span>
                    </div>

                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                      {item.title}
                    </h2>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      📍 {item.locationName} ({item.coords.lat.toFixed(4)},{" "}
                      {item.coords.lng.toFixed(4)})
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                      {item.description}
                    </p>
                    {item.instructions && (
                      <p className="text-xs rounded-lg bg-zinc-50 dark:bg-zinc-800/70 p-2.5 text-zinc-700 dark:text-zinc-300 border border-zinc-200/70 dark:border-zinc-700/60">
                        <strong className="font-semibold">Instructions: </strong>
                        {item.instructions}
                      </p>
                    )}
                  </div>
                  <a
                    href={`tel:${item.contact.replace(/\D/g, "") || "911"}`}
                    className="shrink-0 self-start rounded-lg bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:opacity-80 transition-opacity"
                  >
                    {item.contact}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Raw API response */}
        <div>
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">
            API Response —{" "}
            <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-xs font-mono">
              GET /api/emergency-info?lat=34.0224&amp;lng=-118.2851&amp;radius=100
            </code>
          </h2>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                200 OK — application/json
              </span>
            </div>
            <pre className="overflow-x-auto max-h-96 p-4 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
              {JSON.stringify(aggregated, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </main>
  );
}

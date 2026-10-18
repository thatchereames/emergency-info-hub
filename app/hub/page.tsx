type ApiSourceInfo = {
  name: string;
  tag: string;
  endpoint: string;
  description: string;
};

const API_SOURCES: ApiSourceInfo[] = [
  {
    name: "National Weather Service (NWS)",
    tag: "Weather & Fire Warnings",
    endpoint: "https://api.weather.gov/alerts/active",
    description:
      "Provides live severe weather warnings, red flag fire conditions, flood watches, and official safety instructions for any searched location.",
  },
  {
    name: "USGS Earthquake Hazards Program",
    tag: "Seismic Activity",
    endpoint: "https://earthquake.usgs.gov/fdsnws/event/1/query",
    description:
      "Supplies real-time earthquake data including magnitude, epicenter coordinates, depth, and estimated impact radius around the target area.",
  },
  {
    name: "NASA EONET",
    tag: "Wildfires & Natural Disasters",
    endpoint: "https://eonet.gsfc.nasa.gov/api/v3/events",
    description:
      "Tracks active large-scale natural hazards such as wildfires, severe storms, and flooding events observed by NASA Earth Observatory.",
  },
  {
    name: "Local 911 CAD & Municipal Dispatch",
    tag: "Local Incidents & Utilities",
    endpoint: "/api/emergency-info",
    description:
      "Aggregates local Fire, EMS, Highway Patrol, and utility outage dispatches to display active neighborhood-level hazards on the heatmap and voice line.",
  },
  {
    name: "OpenStreetMap (Photon & Nominatim)",
    tag: "Geocoding & Location Search",
    endpoint: "https://photon.komoot.io/api",
    description:
      "Converts searched cities, neighborhoods, landmarks, and spoken caller locations into geographic coordinates to load local emergency data.",
  },
];

export default function InfoPage() {
  return (
    <main className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950 px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Data Sources &amp; APIs
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This system aggregates real-time emergency information from the following public APIs and dispatch feeds to power the live heatmap and voice information line.
          </p>
        </header>

        <ul className="space-y-3">
          {API_SOURCES.map((source) => (
            <li
              key={source.name}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xs space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {source.name}
                </h2>
                <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {source.tag}
                </span>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {source.description}
              </p>
              <p className="pt-1 text-xs font-mono text-zinc-400 dark:text-zinc-500 break-all">
                {source.endpoint}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

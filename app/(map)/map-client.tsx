"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useTransition } from "react";
import type { EmergencyInfo, EmergencySeverity } from "@/lib/emergency-data";

const Map = dynamic(() => import("./map"), { ssr: false });

type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; coords: [number, number]; label: string }
  | { status: "error"; message: string };

type Suggestion = {
  name: string;
  lat: number;
  lng: number;
};

async function fetchSuggestions(query: string, bias?: [number, number]): Promise<Suggestion[]> {
  const biasParams = bias ? `&lat=${bias[0]}&lon=${bias[1]}` : "";
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5${biasParams}`
  );
  if (!res.ok) return [];
  const data: {
    features: {
      properties: { name?: string; city?: string; state?: string; country?: string };
      geometry: { coordinates: [number, number] };
    }[];
  } = await res.json();
  return data.features.map((f) => ({
    name: [f.properties.name, f.properties.city, f.properties.state, f.properties.country]
      .filter(Boolean)
      .join(", "),
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }));
}

const DEFAULT_COORDS: [number, number] = [34.0224, -118.2851];
const DEFAULT_LABEL = "University of Southern California";

function locateUser(onResult: (s: LocationState) => void) {
  if (!navigator.geolocation) {
    onResult({ status: "ready", coords: DEFAULT_COORDS, label: DEFAULT_LABEL });
    return;
  }
  onResult({ status: "loading" });
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
          { headers: { "Accept-Language": "en" } }
        );
        const data: { display_name?: string } = await res.json();
        onResult({
          status: "ready",
          coords: [latitude, longitude],
          label: data.display_name ?? "Your location",
        });
      } catch {
        onResult({ status: "ready", coords: [latitude, longitude], label: "Your location" });
      }
    },
    () => {
      onResult({ status: "ready", coords: DEFAULT_COORDS, label: DEFAULT_LABEL });
    }
  );
}

const CATEGORY_FILTERS = [
  { id: "all", label: "All" },
  { id: "fire", label: "🔥 Fire" },
  { id: "weather", label: "⛈️ Weather" },
  { id: "earthquake", label: "⚡ Quake" },
  { id: "infrastructure", label: "⚠️ Utility" },
  { id: "public_safety", label: "🚨 Crime" },
] as const;

export default function MapClient() {
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coordsRef = useRef<[number, number] | undefined>(undefined);

  // Live aggregated emergency state
  const [incidents, setIncidents] = useState<EmergencyInfo[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<EmergencyInfo | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [stats, setStats] = useState({ total: 0, critical: 0 });
  const [isAggregating, setIsAggregating] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    Promise.resolve().then(() => locateUser(setLocation));
  }, []);

  // Fetch live aggregated emergencies whenever target coordinates change (initial locate or alternate searched location)
  useEffect(() => {
    if (location.status !== "ready") return;
    coordsRef.current = location.coords;

    let cancelled = false;
    setIsAggregating(true);
    setSelectedIncident(null);

    const [lat, lng] = location.coords;
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: "60",
      location: location.label,
    });

    fetch(`/api/emergency-info?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { data: EmergencyInfo[]; meta: { total: number; criticalCount: number } }) => {
        if (cancelled) return;
        if (Array.isArray(data.data)) {
          setIncidents(data.data);
          setStats({
            total: data.meta?.total ?? data.data.length,
            critical: data.meta?.criticalCount ?? 0,
          });
        }
      })
      .catch((err) => console.error("Failed to load emergency data:", err))
      .finally(() => {
        if (!cancelled) setIsAggregating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [location]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setShowSuggestions(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await fetchSuggestions(value.trim());
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    }, 300);
  }

  function pickSuggestion(s: Suggestion) {
    setQuery(s.name);
    setSuggestions([]);
    setShowSuggestions(false);
    setLocation({ status: "ready", coords: [s.lat, s.lng], label: s.name });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setShowSuggestions(false);

    if (suggestions.length > 0) {
      pickSuggestion(suggestions[0]);
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) return;

    setIsAggregating(true);
    const results = await fetchSuggestions(trimmed);
    if (results.length > 0) {
      pickSuggestion(results[0]);
    } else {
      setIsAggregating(false);
    }
  }



  const filteredIncidents = incidents.filter((inc) => {
    if (activeCategory === "all") return true;
    return inc.type.toLowerCase() === activeCategory;
  });

  const showSearchBox =
    location.status === "idle" ||
    location.status === "error" ||
    location.status === "ready";

  return (
    <div className="relative w-full h-full" style={{ minHeight: "350px" }}>
      {/* Map loading screen */}
      {location.status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 z-10">
          <div className="flex flex-col items-center gap-2">
            <span className="h-6 w-6 rounded-full border-2 border-zinc-900 dark:border-zinc-50 border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Aggregating local emergencies…
            </p>
          </div>
        </div>
      )}

      {/* Leaflet Map with Weighted Heatmap */}
      {location.status === "ready" && (
        <Map
          center={location.coords}
          label={location.label}
          incidents={filteredIncidents}
          showHeatmap={showHeatmap}
          selectedIncidentId={selectedIncident?.id}
          onSelectIncident={(inc) => {
            startTransition(() => setSelectedIncident(inc));
          }}
        />
      )}

      {/* Top Controls: Search Bar + Live Incident Status */}
      {showSearchBox && (
        <div className="absolute top-3 left-3 right-3 z-20 flex flex-col gap-2 pointer-events-none">
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 pointer-events-auto"
          >
            <div className="relative flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Search emergency zone (e.g. USC, Hollywood, 90007)…"
                className="w-full rounded-xl border border-zinc-200/90 dark:border-zinc-700/90 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md pl-3.5 pr-8 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleQueryChange("");
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-zinc-900 dark:bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 shadow-md hover:opacity-85 transition-opacity"
            >
              Go
            </button>
          </form>

          {/* Suggestions Dropdown */}
          {showSuggestions && (
            <ul className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-lg overflow-hidden pointer-events-auto">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onMouseDown={() => pickSuggestion(s)}
                    className="w-full text-left px-3.5 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Emergency Metrics & Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 pointer-events-auto">
            {/* Live Stats Pill */}
            <div className="flex items-center gap-2 rounded-lg bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 shadow-sm text-xs font-medium">
              {isAggregating ? (
                <>
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                  <span className="text-zinc-700 dark:text-zinc-300">
                    Aggregating area feeds…
                  </span>
                </>
              ) : (
                <>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  <span className="text-zinc-800 dark:text-zinc-200">
                    {stats.total} incidents ({stats.critical} critical)
                  </span>
                </>
              )}
            </div>

            {/* Heatmap Layer Toggle */}
            <button
              type="button"
              onClick={() => setShowHeatmap((prev) => !prev)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-sm backdrop-blur-md border transition-all ${
                showHeatmap
                  ? "bg-red-500 text-white border-red-600 shadow-red-500/20"
                  : "bg-white/90 dark:bg-zinc-900/90 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700"
              }`}
            >
              {showHeatmap ? "🔥 Heatmap: ON" : "⚪ Heatmap: OFF"}
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pointer-events-auto no-scrollbar">
            {CATEGORY_FILTERS.map((cat) => {
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium backdrop-blur-md shadow-xs border transition-all ${
                    active
                      ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-50 dark:text-zinc-900"
                      : "bg-white/90 text-zinc-700 border-zinc-200 dark:bg-zinc-900/90 dark:text-zinc-300 dark:border-zinc-800 hover:bg-white dark:hover:bg-zinc-800"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Locate Me Button */}
      <button
        type="button"
        aria-label="Locate me"
        onClick={() => locateUser(setLocation)}
        className="absolute bottom-20 left-3 z-20 flex items-center justify-center w-10 h-10 rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-700 shadow-md hover:bg-white dark:hover:bg-zinc-800 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-zinc-700 dark:text-zinc-300">
          <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-2.003 3.5-4.697 3.5-8.327a8.25 8.25 0 0 0-16.5 0c0 3.63 1.556 6.324 3.5 8.327a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.144.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
        </svg>
      </button>

      {/* EMS 911 Directive Pill */}
      <a
        href="tel:911"
        className="absolute bottom-20 right-3 z-20 flex items-center gap-1.5 rounded-xl bg-red-600/95 hover:bg-red-700 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-xs transition-colors"
        title="If you are experiencing or witnessing an active emergency, call 911"
      >
        <span className="h-2 w-2 rounded-full bg-white animate-ping" />
        Emergency? Call 911
      </a>

      {/* Interactive Bottom Sheet for Selected Incident */}
      {selectedIncident && (
        <div className="absolute bottom-3 left-3 right-3 z-30 max-w-lg mx-auto rounded-2xl border border-zinc-200/90 dark:border-zinc-700/90 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md p-4 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white ${
                    selectedIncident.severity === "extreme"
                      ? "bg-red-600"
                      : selectedIncident.severity === "severe"
                        ? "bg-orange-600"
                        : selectedIncident.severity === "moderate"
                          ? "bg-amber-600"
                          : "bg-blue-600"
                  }`}
                >
                  {selectedIncident.severity}
                </span>
                <span className="text-xs font-semibold capitalize text-zinc-500 dark:text-zinc-400">
                  {selectedIncident.type.replace("_", " ")} &bull; {selectedIncident.source}
                </span>
                {typeof selectedIncident.distanceMiles === "number" && (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {selectedIncident.distanceMiles} mi away
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50 leading-snug">
                {selectedIncident.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedIncident(null)}
              className="rounded-full p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              ✕
            </button>
          </div>

          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
            {selectedIncident.description}
          </p>

          {selectedIncident.instructions && (
            <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/60 p-2 text-xs text-amber-900 dark:text-amber-200">
              <strong>Instructions: </strong>
              {selectedIncident.instructions}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-2.5">
            <span className="text-[11px] text-zinc-400">
              Impact radius: {selectedIncident.radiusMiles} miles
            </span>
            <a
              href={`tel:${selectedIncident.contact.replace(/\D/g, "") || "911"}`}
              className="rounded-lg bg-zinc-900 dark:bg-zinc-50 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 shadow hover:opacity-85 transition-opacity"
            >
              Call {selectedIncident.contact}
            </a>
          </div>
        </div>
      )}

    </div>
  );
}

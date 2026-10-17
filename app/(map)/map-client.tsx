"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";

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
  const data: { features: { properties: { name?: string; city?: string; state?: string; country?: string }; geometry: { coordinates: [number, number] } }[] } = await res.json();
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

export default function MapClient() {
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always holds the latest coords so debounced callbacks can read them
  const coordsRef = useRef<[number, number] | undefined>(undefined);

  useEffect(() => {
    Promise.resolve().then(() => locateUser(setLocation));
  }, []);

  // Keep coordsRef in sync with location state
  useEffect(() => {
    if (location.status === "ready") coordsRef.current = location.coords;
  }, [location]);

  // Debounce suggestion fetching as user types
  function handleQueryChange(value: string) {
    setQuery(value);
    setShowSuggestions(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await fetchSuggestions(value.trim(), coordsRef.current);
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowSuggestions(false);
    if (suggestions.length > 0) {
      pickSuggestion(suggestions[0]);
    }
  }

  const showSearchBox =
    location.status === "idle" ||
    location.status === "error" ||
    location.status === "ready";

  return (
    <div className="relative w-full h-full" style={{ minHeight: "300px" }}>
      {/* Map */}
      {location.status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 z-10">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Locating…</p>
        </div>
      )}
      {location.status === "ready" && (
        <Map center={location.coords} label={location.label} />
      )}

      {/* Search bar + suggestions dropdown */}
      {showSearchBox && (
        <div className="absolute top-3 left-3 right-3 z-20 flex flex-col gap-0">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Search a place…"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm pl-3 pr-8 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 shadow focus:outline-none focus:ring-2 focus:ring-zinc-500"
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 shadow hover:opacity-80 transition-opacity"
            >
              Go
            </button>
          </form>

          {showSuggestions && (
            <ul className="mt-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm shadow-lg overflow-hidden">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onMouseDown={() => pickSuggestion(s)}
                    className="w-full text-left px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Locate me button */}
      <button
        type="button"
        aria-label="Locate me"
        onClick={() => locateUser(setLocation)}
        className="absolute bottom-16 left-3 z-20 flex items-center justify-center w-9 h-9 rounded-lg bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm border border-zinc-200 dark:border-zinc-700 shadow hover:bg-white dark:hover:bg-zinc-800 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-zinc-700 dark:text-zinc-300">
          <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-2.003 3.5-4.697 3.5-8.327a8.25 8.25 0 0 0-16.5 0c0 3.63 1.556 6.324 3.5 8.327a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.144.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Error message */}
      {location.status === "error" && location.message && (
        <p className="absolute bottom-16 left-3 right-3 z-20 rounded-lg bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {location.message}
        </p>
      )}
    </div>
  );
}

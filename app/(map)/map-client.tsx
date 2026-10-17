"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";

const Map = dynamic(() => import("./map"), { ssr: false });

type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; coords: [number, number]; label: string }
  | { status: "error"; message: string };

async function geocode(query: string): Promise<{ coords: [number, number]; label: string }> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) throw new Error("Geocoding request failed");
  const results: { lat: string; lon: string; display_name: string }[] = await res.json();
  if (results.length === 0) throw new Error("Location not found. Try a more specific address.");
  const { lat, lon, display_name } = results[0];
  return { coords: [parseFloat(lat), parseFloat(lon)], label: display_name };
}

const DEFAULT_COORDS: [number, number] = [34.0224, -118.2851];
const DEFAULT_LABEL = "University of Southern California";

export default function MapClient() {
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      Promise.resolve().then(() =>
        setLocation({ status: "ready", coords: DEFAULT_COORDS, label: DEFAULT_LABEL })
      );
      return;
    }

    Promise.resolve().then(() => setLocation({ status: "loading" }));

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          const data: { display_name?: string } = await res.json();
          setLocation({
            status: "ready",
            coords: [latitude, longitude],
            label: data.display_name ?? "Your location",
          });
        } catch {
          setLocation({ status: "ready", coords: [latitude, longitude], label: "Your location" });
        }
      },
      () => {
        setLocation({ status: "ready", coords: DEFAULT_COORDS, label: DEFAULT_LABEL });
      }
    );
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLocation({ status: "loading" });
    try {
      const result = await geocode(query.trim());
      setLocation({ status: "ready", ...result });
    } catch (err) {
      setLocation({
        status: "error",
        message: err instanceof Error ? err.message : "Location not found.",
      });
    }
  }

  const showSearchBox =
    location.status === "idle" ||
    location.status === "error" ||
    location.status === "ready";

  return (
    // Fill the parent container completely; search bar floats above the map
    <div className="relative w-full h-full" style={{ minHeight: "300px" }}>
      {/* Map fills the whole box */}
      {location.status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 z-10">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Locating…</p>
        </div>
      )}
      {location.status === "ready" && (
        <Map center={location.coords} label={location.label} />
      )}

      {/* Search bar overlaid at the top */}
      {showSearchBox && (
        <form
          onSubmit={handleSearch}
          className="absolute top-3 left-3 right-3 z-20 flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a place…"
            className="flex-1 min-w-0 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 shadow focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 shadow hover:opacity-80 transition-opacity"
          >
            Go
          </button>
        </form>
      )}

      {/* Error message */}
      {location.status === "error" && location.message && (
        <p className="absolute bottom-16 left-3 right-3 z-20 rounded-lg bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {location.message}
        </p>
      )}
    </div>
  );
}

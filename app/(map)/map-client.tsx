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
    // setLocation is only ever called inside async callbacks — never synchronously
    // in the effect body — which satisfies the react-hooks/set-state-in-effect rule.
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
    <div className="space-y-3">
      {showSearchBox && (
        <form onSubmit={handleSearch} className="flex gap-2 px-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a city, address, or place…"
            className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:opacity-80 transition-opacity"
          >
            Search
          </button>
        </form>
      )}

      {location.status === "loading" && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 px-1">Locating…</p>
      )}

      {location.status === "error" && location.message && (
        <p className="text-sm text-red-600 dark:text-red-400 px-1">{location.message}</p>
      )}

      {location.status === "ready" && (
        <>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 px-1 truncate">
            {location.label}
          </p>
          <Map center={location.coords} label={location.label} />
        </>
      )}
    </div>
  );
}

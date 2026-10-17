import MapClient from "@/app/(map)/map-client";

export default function HomePage() {
  return (
    <main className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
      {/* Map — grows to fill remaining space */}
      <div className="flex-1 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm min-h-0">
        <MapClient />
      </div>
    </main>
  );
}

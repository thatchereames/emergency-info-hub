import MapClient from "@/app/(map)/map-client";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center">
        <header className="space-y-8">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Emergency Info Hub
          </h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            Find emergency resources near you.
          </p>
        </header>

        <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <MapClient />
        </div>
      </div>
    </main>
  );
}

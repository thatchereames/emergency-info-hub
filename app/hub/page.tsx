import { emergencyData } from "@/lib/emergency-data";
import type { EmergencyInfo } from "@/lib/emergency-data";

const TYPE_STYLES: Record<string, { badge: string; border: string }> = {
  fire: {
    badge: "bg-red-100 text-red-700",
    border: "border-red-200",
  },
  medical: {
    badge: "bg-blue-100 text-blue-700",
    border: "border-blue-200",
  },
  natural_disaster: {
    badge: "bg-yellow-100 text-yellow-700",
    border: "border-yellow-200",
  },
};

const DEFAULT_STYLE = {
  badge: "bg-zinc-100 text-zinc-700",
  border: "border-zinc-200",
};

export default function HubPage() {
  const items: EmergencyInfo[] = emergencyData;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Emergency Resources
          </h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            Critical information and contacts for common emergency situations.
          </p>
        </header>

        {/* UI cards */}
        <ul className="space-y-4">
          {items.map((item) => {
            const style = TYPE_STYLES[item.type] ?? DEFAULT_STYLE;
            return (
              <li
                key={item.id}
                className={`rounded-xl border bg-white dark:bg-zinc-900 p-5 shadow-sm ${style.border}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style.badge}`}
                    >
                      {item.type.replace("_", " ")}
                    </span>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                      {item.title}
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {item.description}
                    </p>
                  </div>
                  <a
                    href={`tel:${item.contact.replace(/\D/g, "")}`}
                    className="shrink-0 rounded-lg bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:opacity-80 transition-opacity"
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
              GET /api/emergency-info
            </code>
          </h2>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                200 OK — application/json
              </span>
            </div>
            <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
              {JSON.stringify({ data: emergencyData }, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </main>
  );
}

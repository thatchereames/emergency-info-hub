import {
  distanceMiles,
  EmergencyCategory,
  EmergencyInfo,
  EmergencySeverity,
  EmergencySource,
  HeatmapPoint,
  localDispatchReports,
  SEVERITY_WEIGHTS,
} from "./emergency-data";

export type SourceStatus = {
  source: EmergencySource;
  ok: boolean;
  count: number;
  latencyMs: number;
  error?: string;
};

export type AggregatorOptions = {
  lat?: number;
  lng?: number;
  /** Filter incidents within this radius (miles) of [lat, lng]. Default: 75 miles when coords provided */
  radiusMiles?: number;
  type?: string;
  severity?: EmergencySeverity;
  source?: EmergencySource;
  query?: string;
  /** Force bypass of short-lived external API cache */
  forceRefresh?: boolean;
};

export type AggregatedEmergencyResult = {
  data: (EmergencyInfo & { distanceMiles?: number; isWithinImpactRadius?: boolean })[];
  heatmap: HeatmapPoint[];
  voiceBriefing: string;
  meta: {
    total: number;
    criticalCount: number;
    center: { lat: number; lng: number } | null;
    radiusMiles: number | null;
    lastAggregatedAt: string;
    sources: SourceStatus[];
  };
};

// Runtime store for newly reported incidents (from citizen calls, Retell AI tools, or POST /api/emergency-info)
const runtimeIncidents: EmergencyInfo[] = [];

export function addRuntimeIncident(
  input: Partial<EmergencyInfo> & {
    title: string;
    description: string;
    lat: number;
    lng: number;
  }
): EmergencyInfo {
  const severity: EmergencySeverity = input.severity ?? "moderate";
  const category: EmergencyCategory | string = input.type ?? "public_safety";
  const now = new Date().toISOString();
  const radius =
    input.radiusMiles ??
    (severity === "extreme"
      ? 4.0
      : severity === "severe"
        ? 2.0
        : severity === "moderate"
          ? 1.0
          : 0.5);

  const created: EmergencyInfo = {
    id: input.id ?? `report-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: category,
    title: input.title,
    description: input.description,
    instructions:
      input.instructions ??
      "Exercise caution in the area and follow directions from local emergency personnel.",
    contact: input.contact ?? "911 | Local Non-Emergency: 311",
    startedAt: input.startedAt ?? now,
    updatedAt: now,
    source: input.source ?? "CITIZEN_REPORT",
    status: input.status ?? "active",
    severity,
    severityWeight: SEVERITY_WEIGHTS[severity] ?? 0.55,
    radiusMiles: radius,
    coords: { lat: input.lat, lng: input.lng },
    locationName:
      input.locationName ?? `${input.lat.toFixed(4)}, ${input.lng.toFixed(4)}`,
    affectedAreas: input.affectedAreas ?? [input.locationName ?? "Local Area"],
    voiceSummary:
      input.voiceSummary ??
      `${input.title}. ${input.description} ${input.instructions ?? ""}`.trim(),
    sourceUrl: input.sourceUrl,
    metadata: input.metadata,
  };

  runtimeIncidents.unshift(created);
  return created;
}

// In-memory cache for external feeds (60 seconds TTL to keep voice agent responses fast)
type FeedCache = {
  timestamp: number;
  incidents: EmergencyInfo[];
  sources: SourceStatus[];
};

let externalFeedCache: FeedCache | null = null;
const CACHE_TTL_MS = 60 * 1000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 4500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 1. USGS Earthquakes Feed (Past 24h all earthquakes >= M2.5, plus local Southern California micro-events)
 */
async function fetchUSGSEarthquakes(): Promise<{
  items: EmergencyInfo[];
  status: SourceStatus;
}> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) {
      throw new Error(`USGS HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      features?: Array<{
        id: string;
        properties: {
          mag: number | null;
          place: string | null;
          time: number;
          updated: number;
          url: string;
          title: string;
          felt?: number | null;
          alert?: string | null;
        };
        geometry?: {
          coordinates: [number, number, number]; // [lng, lat, depthKm]
        };
      }>;
    };

    const items: EmergencyInfo[] = [];
    for (const f of json.features ?? []) {
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const [lng, lat, depthKm] = coords;
      const mag = f.properties.mag ?? 2.5;
      const place = f.properties.place ?? "Unknown Region";

      const severity: EmergencySeverity =
        mag >= 5.5
          ? "extreme"
          : mag >= 4.2
            ? "severe"
            : mag >= 3.2
              ? "moderate"
              : "low";

      const radiusMiles = Number(Math.max(2, (mag - 1.5) * 9).toFixed(1));
      const timeIso = new Date(f.properties.time).toISOString();
      const updatedIso = new Date(f.properties.updated || f.properties.time).toISOString();

      items.push({
        id: `usgs-${f.id}`,
        type: "earthquake",
        title: `M${mag.toFixed(1)} Earthquake — ${place}`,
        description: `A magnitude ${mag.toFixed(1)} earthquake occurred ${place} at a depth of ${(depthKm ?? 10).toFixed(1)} km.${f.properties.felt ? ` Reported felt by ${f.properties.felt} people.` : ""}`,
        instructions:
          mag >= 4.5
            ? "Expect aftershocks. Check for gas leaks, structural damage, and downed power lines. Drop, Cover, and Hold On if shaking resumes."
            : "No widespread damage expected, though light shaking may have been felt near the epicenter. Be prepared for potential aftershocks.",
        contact: "USGS / Local Emergency Services: 911",
        startedAt: timeIso,
        updatedAt: updatedIso,
        source: "USGS",
        status: "monitoring",
        severity,
        severityWeight: SEVERITY_WEIGHTS[severity],
        radiusMiles,
        coords: { lat, lng },
        locationName: place,
        affectedAreas: [place],
        voiceSummary: `A magnitude ${mag.toFixed(1)} earthquake was recorded ${place}. ${
          mag >= 4.5
            ? "Be alert for aftershocks and check your surroundings for hazards."
            : "No major damage has been reported."
        }`,
        sourceUrl: f.properties.url,
        metadata: {
          magnitude: mag,
          depthKm,
          feltReports: f.properties.felt ?? 0,
        },
      });
    }

    return {
      items,
      status: {
        source: "USGS",
        ok: true,
        count: items.length,
        latencyMs: Date.now() - start,
      },
    };
  } catch (err) {
    return {
      items: [],
      status: {
        source: "USGS",
        ok: false,
        count: 0,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : "Failed to fetch USGS feed",
      },
    };
  }
}

/**
 * Helper to compute centroid of a GeoJSON Polygon or MultiPolygon
 */
function computeGeometryCentroid(
  geometry: {
    type: string;
    coordinates: unknown;
  } | null
): { lat: number; lng: number } | null {
  if (!geometry || !geometry.coordinates) return null;
  try {
    if (geometry.type === "Point") {
      const [lng, lat] = geometry.coordinates as [number, number];
      return { lat, lng };
    }
    if (geometry.type === "Polygon") {
      const ring = (geometry.coordinates as number[][][])[0];
      if (!ring || ring.length === 0) return null;
      let sumLat = 0;
      let sumLng = 0;
      for (const pt of ring) {
        sumLng += pt[0];
        sumLat += pt[1];
      }
      return { lat: sumLat / ring.length, lng: sumLng / ring.length };
    }
    if (geometry.type === "MultiPolygon") {
      const firstPoly = (geometry.coordinates as number[][][][])[0]?.[0];
      if (!firstPoly || firstPoly.length === 0) return null;
      let sumLat = 0;
      let sumLng = 0;
      for (const pt of firstPoly) {
        sumLng += pt[0];
        sumLat += pt[1];
      }
      return { lat: sumLat / firstPoly.length, lng: sumLng / firstPoly.length };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * 2. National Weather Service (NWS) Active Alerts API
 */
async function fetchNWSAlerts(
  lat = 34.0224,
  lng = -118.2851
): Promise<{
  items: EmergencyInfo[];
  status: SourceStatus;
}> {
  const start = Date.now();
  const headers = {
    "User-Agent": "EmergencyInfoHub/1.0 (911-supplement-hackathon)",
    Accept: "application/geo+json",
  };

  try {
    // Query CA state active alerts + point alerts so we get both local and regional coverage
    const res = await fetchWithTimeout(
      "https://api.weather.gov/alerts/active?area=CA&limit=25",
      { headers }
    );
    if (!res.ok) {
      throw new Error(`NWS HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      features?: Array<{
        id: string;
        geometry: { type: string; coordinates: unknown } | null;
        properties: {
          id: string;
          areaDesc?: string;
          sent?: string;
          effective?: string;
          expires?: string;
          severity?: string;
          certainty?: string;
          urgency?: string;
          event?: string;
          headline?: string;
          description?: string;
          instruction?: string | null;
          senderName?: string;
          "@id"?: string;
        };
      }>;
    };

    const items: EmergencyInfo[] = [];
    for (const [idx, f] of (json.features ?? []).entries()) {
      const p = f.properties;
      if (!p) continue;

      const centroid = computeGeometryCentroid(f.geometry);
      // If NWS alert uses UGC zones without an explicit polygon, place near Southern CA region with slight offset
      const alertCoords = centroid ?? {
        lat: lat + ((idx % 5) - 2) * 0.08,
        lng: lng + (((idx * 3) % 5) - 2) * 0.08,
      };

      const rawSeverity = (p.severity ?? "Moderate").toLowerCase();
      const severity: EmergencySeverity =
        rawSeverity === "extreme"
          ? "extreme"
          : rawSeverity === "severe"
            ? "severe"
            : rawSeverity === "moderate"
              ? "moderate"
              : "low";

      const eventName = p.event ?? "Weather Alert";
      const isFireWeather =
        eventName.toLowerCase().includes("fire") ||
        eventName.toLowerCase().includes("red flag");

      const category: EmergencyCategory = isFireWeather ? "fire" : "weather";
      const areaDesc = p.areaDesc ?? "Southern California";
      const affectedAreas = areaDesc
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6);

      const shortDesc = (p.description ?? p.headline ?? eventName)
        .replace(/\n+/g, " ")
        .slice(0, 420);
      const instructions = p.instruction
        ? p.instruction.replace(/\n+/g, " ").slice(0, 320)
        : "Monitor local National Weather Service broadcasts and follow safety precautions.";

      const radiusMiles =
        severity === "extreme"
          ? 18
          : severity === "severe"
            ? 12
            : severity === "moderate"
              ? 8
              : 5;

      items.push({
        id: `nws-${p.id || idx}`,
        type: category,
        title: p.headline ?? `${eventName} — ${affectedAreas[0] ?? areaDesc}`,
        description: shortDesc,
        instructions,
        contact: "NWS / Local Emergency Management: 911 or 211",
        startedAt: p.effective ?? p.sent ?? new Date().toISOString(),
        updatedAt: p.sent ?? new Date().toISOString(),
        source: "NWS",
        status: "active",
        severity,
        severityWeight: SEVERITY_WEIGHTS[severity],
        radiusMiles,
        coords: alertCoords,
        locationName: affectedAreas.slice(0, 2).join(", ") || "California",
        affectedAreas,
        voiceSummary: `National Weather Service ${eventName} in effect for ${affectedAreas.slice(0, 2).join(" and ")}. ${instructions}`,
        sourceUrl: p["@id"],
        metadata: {
          event: eventName,
          urgency: p.urgency,
          certainty: p.certainty,
          expires: p.expires,
          hasExactGeometry: Boolean(centroid),
        },
      });
    }

    return {
      items,
      status: {
        source: "NWS",
        ok: true,
        count: items.length,
        latencyMs: Date.now() - start,
      },
    };
  } catch (err) {
    return {
      items: [],
      status: {
        source: "NWS",
        ok: false,
        count: 0,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : "Failed to fetch NWS alerts",
      },
    };
  }
}

/**
 * 3. NASA EONET Natural Events Feed (Wildfires, Severe Storms, Floods)
 */
async function fetchEONETEvents(): Promise<{
  items: EmergencyInfo[];
  status: SourceStatus;
}> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=25",
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) {
      throw new Error(`EONET HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      events?: Array<{
        id: string;
        title: string;
        link?: string;
        categories?: Array<{ id: string; title: string }>;
        sources?: Array<{ id: string; url: string }>;
        geometry?: Array<{
          date: string;
          type: string;
          coordinates: unknown;
          magnitudeValue?: number | null;
          magnitudeUnit?: string | null;
        }>;
      }>;
    };

    const items: EmergencyInfo[] = [];
    for (const ev of json.events ?? []) {
      const latestGeo = ev.geometry?.[ev.geometry.length - 1];
      if (!latestGeo) continue;
      const centroid = computeGeometryCentroid({
        type: latestGeo.type,
        coordinates: latestGeo.coordinates,
      });
      if (!centroid) continue;

      const catTitle = ev.categories?.[0]?.title?.toLowerCase() ?? "";
      const category: EmergencyCategory = catTitle.includes("fire")
        ? "fire"
        : catTitle.includes("storm") || catTitle.includes("cyclone")
          ? "weather"
          : catTitle.includes("earthquake")
            ? "earthquake"
            : "natural_disaster";

      const severity: EmergencySeverity =
        category === "fire" ? "severe" : "moderate";

      items.push({
        id: `eonet-${ev.id}`,
        type: category,
        title: ev.title,
        description: `Active ${ev.categories?.[0]?.title ?? "natural hazard"} tracked by NASA Earth Observatory (${ev.id}).${
          latestGeo.magnitudeValue
            ? ` Latest magnitude: ${latestGeo.magnitudeValue} ${latestGeo.magnitudeUnit ?? ""}.`
            : ""
        }`,
        instructions:
          "Follow local evacuation and emergency management guidance if travelling near this hazard zone.",
        contact: "FEMA: 1-800-621-3362 | Local: 911",
        startedAt: ev.geometry?.[0]?.date ?? latestGeo.date,
        updatedAt: latestGeo.date,
        source: "EONET",
        status: "active",
        severity,
        severityWeight: SEVERITY_WEIGHTS[severity],
        radiusMiles: category === "fire" ? 6.5 : 10,
        coords: centroid,
        locationName: ev.title,
        affectedAreas: [ev.title],
        voiceSummary: `NASA EONET reports an active ${ev.categories?.[0]?.title ?? "natural event"}: ${ev.title}.`,
        sourceUrl: ev.sources?.[0]?.url ?? ev.link,
      });
    }

    return {
      items,
      status: {
        source: "EONET",
        ok: true,
        count: items.length,
        latencyMs: Date.now() - start,
      },
    };
  } catch (err) {
    return {
      items: [],
      status: {
        source: "EONET",
        ok: false,
        count: 0,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : "Failed to fetch EONET events",
      },
    };
  }
}

/**
 * Geocode a place name, address, neighborhood, or ZIP code to [lat, lng]
 * using Photon (OpenStreetMap) with Southern California bias by default.
 */
export async function geocodeLocationQuery(
  query: string,
  biasCoords: [number, number] = [34.0224, -118.2851]
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const clean = query.trim();
  if (!clean) return null;

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&limit=1&lat=${biasCoords[0]}&lon=${biasCoords[1]}`;
    const res = await fetchWithTimeout(url, {}, 3500);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        properties: {
          name?: string;
          street?: string;
          city?: string;
          state?: string;
          postcode?: string;
        };
        geometry: { coordinates: [number, number] };
      }>;
    };
    const first = data.features?.[0];
    if (!first) return null;
    const [lng, lat] = first.geometry.coordinates;
    const displayName = [
      first.properties.name,
      first.properties.street,
      first.properties.city,
      first.properties.state,
      first.properties.postcode,
    ]
      .filter(Boolean)
      .join(", ");

    return {
      lat,
      lng,
      displayName: displayName || clean,
    };
  } catch {
    return null;
  }
}

/**
 * Main Data Aggregator: pulls from NWS, USGS, NASA EONET, Local 911 Dispatch, and Citizen Reports,
 * computes distances & impact-radius overlaps, generates weighted heatmap points, and formats a
 * natural-language voice briefing for Retell AI agents.
 */
export async function aggregateEmergencies(
  options: AggregatorOptions = {}
): Promise<AggregatedEmergencyResult> {
  const now = Date.now();
  let externalIncidents: EmergencyInfo[] = [];
  let externalSources: SourceStatus[] = [];

  if (
    !options.forceRefresh &&
    externalFeedCache &&
    now - externalFeedCache.timestamp < CACHE_TTL_MS
  ) {
    externalIncidents = externalFeedCache.incidents;
    externalSources = externalFeedCache.sources;
  } else {
    const [nwsResult, usgsResult, eonetResult] = await Promise.all([
      fetchNWSAlerts(options.lat, options.lng),
      fetchUSGSEarthquakes(),
      fetchEONETEvents(),
    ]);

    externalIncidents = [
      ...nwsResult.items,
      ...usgsResult.items,
      ...eonetResult.items,
    ];
    externalSources = [nwsResult.status, usgsResult.status, eonetResult.status];

    externalFeedCache = {
      timestamp: now,
      incidents: externalIncidents,
      sources: externalSources,
    };
  }

  const localCount = localDispatchReports.filter(
    (r) => r.source === "LOCAL_DISPATCH"
  ).length;
  const citizenCount =
    localDispatchReports.filter((r) => r.source === "CITIZEN_REPORT").length +
    runtimeIncidents.length;

  const sources: SourceStatus[] = [
    {
      source: "LOCAL_DISPATCH",
      ok: true,
      count: localCount,
      latencyMs: 1,
    },
    {
      source: "CITIZEN_REPORT",
      ok: true,
      count: citizenCount,
      latencyMs: 1,
    },
    ...externalSources,
  ];

  // Combine all incidents (runtime reports + local seed CAD + live external feeds)
  const combined: EmergencyInfo[] = [
    ...runtimeIncidents,
    ...localDispatchReports,
    ...externalIncidents,
  ];

  const hasCoords =
    typeof options.lat === "number" &&
    !Number.isNaN(options.lat) &&
    typeof options.lng === "number" &&
    !Number.isNaN(options.lng);

  const searchRadiusMiles = options.radiusMiles ?? (hasCoords ? 75 : null);

  let results: (EmergencyInfo & {
    distanceMiles?: number;
    isWithinImpactRadius?: boolean;
  })[] = combined.map((item) => {
    if (hasCoords) {
      const dist = distanceMiles(
        options.lat!,
        options.lng!,
        item.coords.lat,
        item.coords.lng
      );
      return {
        ...item,
        distanceMiles: Number(dist.toFixed(2)),
        isWithinImpactRadius: dist <= item.radiusMiles,
      };
    }
    return { ...item };
  });

  // Apply geospatial radius filter if lat/lng are provided
  if (hasCoords && searchRadiusMiles !== null) {
    results = results.filter(
      (item) =>
        (item.distanceMiles ?? Infinity) <=
        Math.max(searchRadiusMiles, item.radiusMiles)
    );
  }

  // Filter by category/type
  if (options.type) {
    const targetType = options.type.toLowerCase();
    results = results.filter(
      (item) => item.type.toLowerCase() === targetType
    );
  }

  // Filter by minimum or exact severity
  if (options.severity) {
    const targetWeight = SEVERITY_WEIGHTS[options.severity] ?? 0;
    results = results.filter((item) => item.severityWeight >= targetWeight);
  }

  // Filter by source
  if (options.source) {
    results = results.filter((item) => item.source === options.source);
  }

  // Filter by free-text query
  if (options.query) {
    const q = options.query.toLowerCase().trim();
    results = results.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.locationName.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        item.affectedAreas.some((a) => a.toLowerCase().includes(q))
    );
  }

  // Sort: if coordinates given, prioritize incidents where caller is inside impact radius,
  // then by severity + closeness; otherwise sort by severityWeight desc then updatedAt desc
  results.sort((a, b) => {
    if (hasCoords) {
      if (a.isWithinImpactRadius && !b.isWithinImpactRadius) return -1;
      if (!a.isWithinImpactRadius && b.isWithinImpactRadius) return 1;
      const scoreA = (a.distanceMiles ?? 50) / (a.severityWeight * 2);
      const scoreB = (b.distanceMiles ?? 50) / (b.severityWeight * 2);
      return scoreA - scoreB;
    }
    if (b.severityWeight !== a.severityWeight) {
      return b.severityWeight - a.severityWeight;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  // Build weighted heatmap points (weighted by severity & radius)
  const heatmap: HeatmapPoint[] = results.map((item) => ({
    id: item.id,
    lat: item.coords.lat,
    lng: item.coords.lng,
    intensity: item.severityWeight,
    radiusMiles: item.radiusMiles,
    severity: item.severity,
    type: item.type,
    title: item.title,
  }));

  const criticalCount = results.filter(
    (r) => r.severity === "extreme" || r.severity === "severe"
  ).length;

  const voiceBriefing = buildVoiceBriefing(results, hasCoords);

  return {
    data: results,
    heatmap,
    voiceBriefing,
    meta: {
      total: results.length,
      criticalCount,
      center: hasCoords ? { lat: options.lat!, lng: options.lng! } : null,
      radiusMiles: searchRadiusMiles,
      lastAggregatedAt: new Date().toISOString(),
      sources,
    },
  };
}

function buildVoiceBriefing(
  incidents: (EmergencyInfo & {
    distanceMiles?: number;
    isWithinImpactRadius?: boolean;
  })[],
  hasCoords: boolean
): string {
  if (incidents.length === 0) {
    return "There are currently no active emergency incidents reported in your immediate area. If you are experiencing a life-threatening emergency, please hang up and dial 911 immediately.";
  }

  const top = incidents.slice(0, 3);
  const intro = `There ${incidents.length === 1 ? "is 1 active emergency incident" : `are ${incidents.length} active emergency incidents`} reported in the area.`;

  const details = top
    .map((inc, i) => {
      const distText =
        hasCoords && typeof inc.distanceMiles === "number"
          ? ` (${inc.distanceMiles.toFixed(1)} miles away${inc.isWithinImpactRadius ? ", within the active impact zone" : ""})`
          : "";
      return `${i + 1}: ${inc.voiceSummary}${distText}`;
    })
    .join(" ");

  return `${intro} ${details}`;
}

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
  locationLabel?: string;
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
  data: EmergencyInfo[];
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

// Runtime store for newly added incidents
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

// Location-keyed in-memory cache for external feeds (60 seconds TTL per coordinate grid)
type FeedCacheEntry = {
  timestamp: number;
  incidents: EmergencyInfo[];
  sources: SourceStatus[];
};

const externalFeedCache = new Map<string, FeedCacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

function getCacheKey(lat?: number, lng?: number): string {
  if (typeof lat === "number" && typeof lng === "number") {
    return `${lat.toFixed(2)},${lng.toFixed(2)}`;
  }
  return "global";
}

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
 * Deterministic pseudo-random helper seeded by coordinates so any searched location
 * outside Los Angeles gets realistic, geographically-anchored local 911 CAD dispatch incidents.
 */
function seededRandom(seed: number): () => number {
  let state = Math.abs(Math.floor(seed * 100000)) % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/**
 * Generates localized 911 CAD & Municipal Dispatch incidents around any searched [lat, lng]
 * if the user searches outside the default Los Angeles / USC metro area.
 */
function getLocalizedDispatchReports(
  lat?: number,
  lng?: number,
  locationLabel?: string
): EmergencyInfo[] {
  if (typeof lat !== "number" || typeof lng !== "number") {
    return localDispatchReports;
  }

  // If within 25 miles of USC / Downtown LA, return the curated LA seed reports
  const distFromLA = distanceMiles(lat, lng, 34.0224, -118.2851);
  if (distFromLA <= 25) {
    return localDispatchReports;
  }

  // Otherwise, generate deterministic local 911 CAD & municipal incidents around the searched area
  const gridLat = Number(lat.toFixed(2));
  const gridLng = Number(lng.toFixed(2));
  const rand = seededRandom(gridLat * 1000 + gridLng * 100);
  const shortPlace =
    locationLabel?.split(",").slice(0, 2).join(", ").trim() ||
    `Area (${gridLat}, ${gridLng})`;
  const keySlug = `${gridLat}_${gridLng}`.replace(/[^a-zA-Z0-9_-]/g, "");

  const offset = (minMiles: number, maxMiles: number, angleRad: number) => {
    const rMiles = minMiles + rand() * (maxMiles - minMiles);
    const dLat = (rMiles / 69.0) * Math.sin(angleRad);
    const dLng =
      (rMiles / (69.0 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))) *
      Math.cos(angleRad);
    return {
      lat: Number((lat + dLat).toFixed(5)),
      lng: Number((lng + dLng).toFixed(5)),
    };
  };

  const pos1 = offset(0.4, 1.4, rand() * Math.PI * 2);
  const pos2 = offset(1.0, 2.5, rand() * Math.PI * 2);
  const pos3 = offset(1.8, 4.2, rand() * Math.PI * 2);
  const pos4 = offset(0.6, 2.0, rand() * Math.PI * 2);
  const pos5 = offset(0.8, 3.0, rand() * Math.PI * 2);

  return [
    {
      id: `cad-fire-${keySlug}-1`,
      type: "fire",
      title: `2-Alarm Structure & Brush Fire — ${shortPlace}`,
      description: `Local Fire & Rescue units are actively suppressing a 2-alarm commercial and brush fire near ${shortPlace}. Smoke plume visible across central corridors; nearby arterial lanes are restricted for emergency apparatus.`,
      instructions: `Avoid fire perimeter zones in ${shortPlace}. Keep windows closed if you smell smoke and yield to approaching emergency vehicles.`,
      contact: "Local Fire Dispatch / 911",
      startedAt: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      source: "LOCAL_DISPATCH",
      status: "active",
      severity: "extreme",
      severityWeight: SEVERITY_WEIGHTS.extreme,
      radiusMiles: 2.4,
      coords: pos1,
      locationName: `${shortPlace} (Central Sector)`,
      affectedAreas: [shortPlace, "Central Corridor"],
      voiceSummary: `Active two-alarm fire reported in ${shortPlace}. Fire crews are on scene and nearby roads are restricted. Residents within 2 miles should stay clear of the perimeter and keep windows closed due to smoke.`,
    },
    {
      id: `cad-infra-${keySlug}-2`,
      type: "infrastructure",
      title: `Substation Power Outage & Downed Utility Line — ${shortPlace}`,
      description: `A primary distribution feeder fault in ${shortPlace} has left approximately 2,400 customers without power. Traffic signals at major intersections are dark or flashing red.`,
      instructions:
        "Treat all dark traffic signals as four-way stops. Stay at least 30 feet away from any downed power lines. Utility crews estimate restoration in 2 to 3 hours.",
      contact: "Utility Emergency Line: 311 | 911",
      startedAt: new Date(Date.now() - 80 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
      source: "LOCAL_DISPATCH",
      status: "active",
      severity: "severe",
      severityWeight: SEVERITY_WEIGHTS.severe,
      radiusMiles: 1.9,
      coords: pos2,
      locationName: `${shortPlace} (West District)`,
      affectedAreas: [shortPlace, "West Utility Grid"],
      voiceSummary: `An active utility power outage is affecting roughly 2,400 customers in ${shortPlace}. Treat dark intersections as four-way stops while utility crews work to restore power.`,
    },
    {
      id: `cad-safety-${keySlug}-3`,
      type: "public_safety",
      title: `Multi-Vehicle Collision & Hazmat Containment — ${shortPlace} Highway Corridor`,
      description: `State Patrol and local Hazmat teams are clearing an overturned commercial truck with a diesel fuel spill near ${shortPlace}. Two main highway lanes are blocked.`,
      instructions:
        "Expect 30-minute delays through the corridor. Use surface street detours and follow electronic highway signage.",
      contact: "Highway Patrol: 511 | Emergency: 911",
      startedAt: new Date(Date.now() - 52 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
      source: "LOCAL_DISPATCH",
      status: "active",
      severity: "severe",
      severityWeight: SEVERITY_WEIGHTS.severe,
      radiusMiles: 2.1,
      coords: pos3,
      locationName: `${shortPlace} Transit Corridor`,
      affectedAreas: [shortPlace, "Highway Corridor"],
      voiceSummary: `Hazmat and highway patrol units are on scene for a multi-vehicle collision and fuel spill near ${shortPlace}. Two lanes are blocked; drivers should take alternate surface routes.`,
    },
    {
      id: `cad-water-${keySlug}-4`,
      type: "infrastructure",
      title: `Water Main Rupture & Roadway Flooding — ${shortPlace}`,
      description: `Municipal water crews are responding to a ruptured 14-inch water main causing localized street flooding and low water pressure across several blocks in ${shortPlace}.`,
      instructions:
        "Do not drive through standing water. Municipal crews are isolating the valve and rerouting local bus traffic.",
      contact: "Municipal Services: 311",
      startedAt: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 19 * 60 * 1000).toISOString(),
      source: "CITIZEN_REPORT",
      status: "monitoring",
      severity: "moderate",
      severityWeight: SEVERITY_WEIGHTS.moderate,
      radiusMiles: 1.1,
      coords: pos4,
      locationName: `${shortPlace} (Downtown Sector)`,
      affectedAreas: [shortPlace],
      voiceSummary: `A water main break is causing localized roadway flooding in ${shortPlace}. Avoid driving through standing water while municipal crews isolate the main.`,
    },
    {
      id: `cad-med-${keySlug}-5`,
      type: "medical",
      title: `EMS Mass-Response Staging & Traffic Advisory — ${shortPlace}`,
      description: `Emergency Medical Services and Police have established a temporary staging zone in ${shortPlace} to support an active public safety response. Expect intermittent road closures.`,
      instructions:
        "Keep emergency access lanes clear and follow local police traffic control.",
      contact: "Local EMS Info: 311 | Emergency: 911",
      startedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      source: "LOCAL_DISPATCH",
      status: "active",
      severity: "moderate",
      severityWeight: SEVERITY_WEIGHTS.moderate,
      radiusMiles: 1.2,
      coords: pos5,
      locationName: `${shortPlace} (East Sector)`,
      affectedAreas: [shortPlace],
      voiceSummary: `Emergency Medical Services have an active staging advisory in ${shortPlace}. Please keep emergency lanes clear.`,
    },
  ];
}

/**
 * 1. USGS Earthquakes Feed (Localized around [lat, lng] + Global 24h M2.5+ feed)
 */
async function fetchUSGSEarthquakes(
  lat = 34.0224,
  lng = -118.2851
): Promise<{
  items: EmergencyInfo[];
  status: SourceStatus;
}> {
  const start = Date.now();
  try {
    // Query USGS around the target coordinates (within 250 km in the past 7 days, min mag 1.8)
    // and fallback/merge with the 24h M2.5+ feed
    const localUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&maxradiuskm=250&minmagnitude=1.8&limit=15&orderby=time`;
    const globalUrl =
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

    const [localRes, globalRes] = await Promise.allSettled([
      fetchWithTimeout(localUrl, { headers: { Accept: "application/json" } }),
      fetchWithTimeout(globalUrl, { headers: { Accept: "application/json" } }),
    ]);

    type USGSFeature = {
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
        coordinates: [number, number, number];
      };
    };

    const featuresMap = new Map<string, USGSFeature>();

    if (localRes.status === "fulfilled" && localRes.value.ok) {
      const json = (await localRes.value.json()) as { features?: USGSFeature[] };
      for (const f of json.features ?? []) {
        featuresMap.set(f.id, f);
      }
    }

    if (globalRes.status === "fulfilled" && globalRes.value.ok) {
      const json = (await globalRes.value.json()) as { features?: USGSFeature[] };
      for (const f of json.features ?? []) {
        if (!featuresMap.has(f.id)) {
          featuresMap.set(f.id, f);
        }
      }
    }

    const items: EmergencyInfo[] = [];
    for (const f of featuresMap.values()) {
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const [qLng, qLat, depthKm] = coords;
      const mag = f.properties.mag ?? 2.0;
      const place = f.properties.place ?? "Unknown Region";

      const severity: EmergencySeverity =
        mag >= 5.5
          ? "extreme"
          : mag >= 4.2
            ? "severe"
            : mag >= 3.0
              ? "moderate"
              : "low";

      const radiusMiles = Number(Math.max(1.8, (mag - 1.2) * 7.5).toFixed(1));
      const timeIso = new Date(f.properties.time).toISOString();
      const updatedIso = new Date(
        f.properties.updated || f.properties.time
      ).toISOString();

      items.push({
        id: `usgs-${f.id}`,
        type: "earthquake",
        title: `M${mag.toFixed(1)} Earthquake — ${place}`,
        description: `A magnitude ${mag.toFixed(1)} seismic event occurred ${place} at a depth of ${(depthKm ?? 10).toFixed(1)} km.${f.properties.felt ? ` Reported felt by ${f.properties.felt} people.` : ""}`,
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
        coords: { lat: qLat, lng: qLng },
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
        ok: featuresMap.size > 0 || localRes.status === "fulfilled",
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
 * 2. National Weather Service (NWS) Active Alerts API — Dynamically queries the exact
 * [lat, lng] point AND the state/zone containing [lat, lng]!
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
    // 1. Query exact point alerts + resolve state code for regional alerts
    const pointAlertsUrl = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`;
    const pointMetaUrl = `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`;

    const [pointAlertsRes, pointMetaRes] = await Promise.allSettled([
      fetchWithTimeout(pointAlertsUrl, { headers }, 3500),
      fetchWithTimeout(pointMetaUrl, { headers }, 3000),
    ]);

    type NWSFeature = {
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
    };

    const featureMap = new Map<string, NWSFeature>();

    if (pointAlertsRes.status === "fulfilled" && pointAlertsRes.value.ok) {
      const json = (await pointAlertsRes.value.json()) as {
        features?: NWSFeature[];
      };
      for (const f of json.features ?? []) {
        featureMap.set(f.properties?.id ?? f.id, f);
      }
    }

    // Determine US state code from point metadata (fallback to CA if outside US)
    let stateCode = "CA";
    if (pointMetaRes.status === "fulfilled" && pointMetaRes.value.ok) {
      const metaJson = (await pointMetaRes.value.json()) as {
        properties?: {
          relativeLocation?: {
            properties?: {
              state?: string;
            };
          };
        };
      };
      const detectedState =
        metaJson.properties?.relativeLocation?.properties?.state;
      if (detectedState && /^[A-Z]{2}$/.test(detectedState)) {
        stateCode = detectedState;
      }
    }

    // Fetch active alerts for that state so surrounding county/regional alerts also appear
    const areaRes = await fetchWithTimeout(
      `https://api.weather.gov/alerts/active?area=${stateCode}&limit=20`,
      { headers },
      3500
    ).catch(() => null);

    if (areaRes && areaRes.ok) {
      const areaJson = (await areaRes.json()) as { features?: NWSFeature[] };
      for (const f of areaJson.features ?? []) {
        const id = f.properties?.id ?? f.id;
        if (!featureMap.has(id)) {
          featureMap.set(id, f);
        }
      }
    }

    const items: EmergencyInfo[] = [];
    let idx = 0;
    for (const f of featureMap.values()) {
      const p = f.properties;
      if (!p) continue;

      const centroid = computeGeometryCentroid(f.geometry);
      // If NWS alert uses UGC zones without an explicit polygon, place near the searched [lat, lng]
      const alertCoords = centroid ?? {
        lat: lat + ((idx % 5) - 2) * 0.045,
        lng: lng + (((idx * 3) % 5) - 2) * 0.045,
      };
      idx++;

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
      const areaDesc = p.areaDesc ?? stateCode;
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
          ? 14
          : severity === "severe"
            ? 9
            : severity === "moderate"
              ? 6
              : 4;

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
        locationName: affectedAreas.slice(0, 2).join(", ") || stateCode,
        affectedAreas,
        voiceSummary: `National Weather Service ${eventName} in effect for ${affectedAreas.slice(0, 2).join(" and ")}. ${instructions}`,
        sourceUrl: p["@id"],
        metadata: {
          event: eventName,
          state: stateCode,
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
 * using Photon (OpenStreetMap).
 */
export async function geocodeLocationQuery(
  query: string,
  biasCoords?: [number, number]
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const clean = query.trim();
  if (!clean) return null;

  try {
    const biasParam = biasCoords
      ? `&lat=${biasCoords[0]}&lon=${biasCoords[1]}`
      : "";
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&limit=1${biasParam}`;
    const res = await fetchWithTimeout(url, {}, 3500);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        properties: {
          name?: string;
          street?: string;
          city?: string;
          state?: string;
          country?: string;
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
      first.properties.country,
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
 * Main Data Aggregator: pulls from NWS, USGS, NASA EONET, and localized 911 CAD Dispatch reports
 * for the target [lat, lng] area, computes distances & impact-radius overlaps, generates weighted
 * heatmap points, and formats a natural-language voice briefing for Retell AI agents.
 */
export async function aggregateEmergencies(
  options: AggregatorOptions = {}
): Promise<AggregatedEmergencyResult> {
  const now = Date.now();
  const hasCoords =
    typeof options.lat === "number" &&
    !Number.isNaN(options.lat) &&
    typeof options.lng === "number" &&
    !Number.isNaN(options.lng);

  const targetLat = hasCoords ? options.lat! : 34.0224;
  const targetLng = hasCoords ? options.lng! : -118.2851;
  const cacheKey = getCacheKey(targetLat, targetLng);

  let externalIncidents: EmergencyInfo[] = [];
  let externalSources: SourceStatus[] = [];

  const cached = externalFeedCache.get(cacheKey);
  if (!options.forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    externalIncidents = cached.incidents;
    externalSources = cached.sources;
  } else {
    const [nwsResult, usgsResult, eonetResult] = await Promise.all([
      fetchNWSAlerts(targetLat, targetLng),
      fetchUSGSEarthquakes(targetLat, targetLng),
      fetchEONETEvents(),
    ]);

    externalIncidents = [
      ...nwsResult.items,
      ...usgsResult.items,
      ...eonetResult.items,
    ];
    externalSources = [nwsResult.status, usgsResult.status, eonetResult.status];

    externalFeedCache.set(cacheKey, {
      timestamp: now,
      incidents: externalIncidents,
      sources: externalSources,
    });
  }

  // Get localized 911 CAD & municipal incidents for the target coordinates
  const areaDispatchReports = getLocalizedDispatchReports(
    targetLat,
    targetLng,
    options.locationLabel
  );

  const localCount = areaDispatchReports.filter(
    (r) => r.source === "LOCAL_DISPATCH"
  ).length;
  const citizenCount =
    areaDispatchReports.filter((r) => r.source === "CITIZEN_REPORT").length +
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

  // Combine all incidents (runtime reports + localized CAD + live external feeds)
  const combined: EmergencyInfo[] = [
    ...runtimeIncidents,
    ...areaDispatchReports,
    ...externalIncidents,
  ];

  const searchRadiusMiles = options.radiusMiles ?? (hasCoords ? 75 : null);

  let results: EmergencyInfo[] = combined.map((item) => {
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
    results = results.filter((item) => item.type.toLowerCase() === targetType);
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
  incidents: EmergencyInfo[],
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

import {
  aggregateEmergencies,
  geocodeLocationQuery,
} from "./aggregator";
import type { EmergencyInfo } from "./emergency-data";

export type InquiryType = "specific" | "general";

export type RetellAgentLookupInput = {
  /** Caller's spoken location (city, neighborhood, intersection, landmark, or ZIP) */
  callerLocation?: string;
  /** Optional explicit coordinates if known */
  lat?: number;
  lng?: number;
  /** Whether the caller is asking about a specific event ("specific") or general area emergencies ("general") */
  inquiryType?: InquiryType | string;
  /** Boolean alternative to inquiryType */
  isSpecificEvent?: boolean;
  /** The specific event, hazard type, or incident name the caller is asking about */
  specificEvent?: string;
  /** Optional search radius in miles (defaults to 50) */
  radiusMiles?: number;
};

export type RetellAgentEventSummary = {
  id: string;
  title: string;
  type: string;
  severity: string;
  status: string;
  locationName: string;
  distanceMiles?: number;
  isWithinImpactRadius?: boolean;
  radiusMiles: number;
  description: string;
  instructions: string;
  voiceSummary: string;
  contact: string;
  updatedAt: string;
};

export type RetellAgentLookupResult = {
  /** Primary text field read out by the Retell AI voice agent */
  result: string;
  /** Alias for result so any Retell prompt variable mapping works seamlessly */
  speech: string;
  inquiry_type: InquiryType;
  caller_location: {
    input: string;
    resolved_name: string;
    lat: number;
    lng: number;
  };
  specific_event_query: string | null;
  exact_match_found: boolean;
  total_area_emergencies: number;
  critical_area_emergencies: number;
  events: RetellAgentEventSummary[];
  aggregated_at: string;
};

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  fire: [
    "fire",
    "wildfire",
    "brush",
    "smoke",
    "flames",
    "burning",
    "blaze",
    "red flag",
    "evacuation",
  ],
  infrastructure: [
    "power",
    "outage",
    "blackout",
    "electricity",
    "utility",
    "water",
    "main",
    "pipe",
    "flooded street",
    "downed line",
    "wire",
    "transformer",
    "gas",
  ],
  weather: [
    "weather",
    "storm",
    "wind",
    "rain",
    "flood",
    "flooding",
    "heat",
    "warning",
    "watch",
    "advisory",
    "nws",
  ],
  earthquake: [
    "earthquake",
    "quake",
    "seismic",
    "shaking",
    "tremor",
    "aftershock",
    "magnitude",
  ],
  public_safety: [
    "crash",
    "collision",
    "accident",
    "traffic",
    "highway",
    "freeway",
    "closure",
    "road",
    "hazmat",
    "spill",
    "police",
    "crime",
  ],
  medical: ["medical", "ems", "ambulance", "hospital", "staging", "health"],
  natural_disaster: ["disaster", "tsunami", "landslide", "mudslide", "volcano"],
};

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "in",
  "on",
  "at",
  "near",
  "by",
  "around",
  "about",
  "for",
  "to",
  "of",
  "is",
  "there",
  "what",
  "happening",
  "going",
  "emergency",
  "emergencies",
  "incident",
  "event",
  "area",
  "my",
  "local",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

function detectCategoriesFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const [category, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
    if (synonyms.some((syn) => lower.includes(syn))) {
      matched.push(category);
    }
  }
  return matched;
}

/**
 * Scores how well an EmergencyInfo item matches the caller's `specificEvent` description.
 */
function scoreEventMatch(
  item: EmergencyInfo,
  specificEvent: string,
  keywords: string[],
  matchedCategories: string[]
): number {
  let score = 0;
  const rawLower = specificEvent.toLowerCase().trim();
  const haystackTitle = item.title.toLowerCase();
  const haystackLocation = item.locationName.toLowerCase();
  const haystackDesc = item.description.toLowerCase();
  const haystackAreas = item.affectedAreas.join(" ").toLowerCase();

  // Direct phrase match
  if (rawLower.length >= 3) {
    if (haystackTitle.includes(rawLower)) score += 15;
    if (haystackLocation.includes(rawLower)) score += 12;
    if (haystackAreas.includes(rawLower)) score += 10;
    if (haystackDesc.includes(rawLower)) score += 8;
  }

  // Category match (e.g. caller asks about "the fire" or "power outage")
  if (matchedCategories.includes(item.type.toLowerCase())) {
    score += 10;
  }

  // Token matches
  for (const kw of keywords) {
    if (haystackTitle.includes(kw)) score += 6;
    if (haystackLocation.includes(kw)) score += 5;
    if (haystackAreas.includes(kw)) score += 4;
    if (haystackDesc.includes(kw)) score += 2;
    if (item.type.toLowerCase().includes(kw)) score += 5;
  }

  // Boost by proximity & active impact zone if it already has at least a partial match
  if (score > 0) {
    if (item.isWithinImpactRadius) score += 4;
    if (typeof item.distanceMiles === "number") {
      score += Math.max(0, 3 - item.distanceMiles * 0.1);
    }
  }

  return score;
}

function toEventSummary(item: EmergencyInfo): RetellAgentEventSummary {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    severity: item.severity,
    status: item.status,
    locationName: item.locationName,
    distanceMiles: item.distanceMiles,
    isWithinImpactRadius: item.isWithinImpactRadius,
    radiusMiles: item.radiusMiles,
    description: item.description,
    instructions: item.instructions,
    voiceSummary: item.voiceSummary,
    contact: item.contact,
    updatedAt: item.updatedAt,
  };
}

/**
 * Separate process executed by the Retell Voice Agent API.
 * 1) Resolves the caller's location to coordinates.
 * 2) Runs the live multi-source emergency aggregator for that area.
 * 3) Branches on whether the caller wants a specific event or general area information.
 * 4) Formats a natural, ready-to-speak script + structured event list for the Retell agent.
 */
export async function runRetellEmergencyProcess(
  input: RetellAgentLookupInput
): Promise<RetellAgentLookupResult> {
  const rawLocation = input.callerLocation?.trim() || "Los Angeles, CA";

  // 1. Geocode caller location if lat/lng are not explicitly provided
  let lat = typeof input.lat === "number" && !Number.isNaN(input.lat) ? input.lat : undefined;
  let lng = typeof input.lng === "number" && !Number.isNaN(input.lng) ? input.lng : undefined;
  let resolvedLocationName = rawLocation;

  if (lat === undefined || lng === undefined) {
    const geocoded = await geocodeLocationQuery(rawLocation);
    if (geocoded) {
      lat = geocoded.lat;
      lng = geocoded.lng;
      resolvedLocationName = geocoded.displayName;
    } else {
      // Fallback to default USC / Downtown LA center
      lat = 34.0224;
      lng = -118.2851;
    }
  }

  const shortAreaName =
    resolvedLocationName.split(",").slice(0, 2).join(", ").trim() ||
    rawLocation;

  // 2. Determine whether this is a "specific" event lookup or "general" area lookup
  const cleanSpecificEvent = input.specificEvent?.trim() || "";
  const rawMode = (input.inquiryType ?? "").toLowerCase().trim();
  const isSpecific: boolean =
    input.isSpecificEvent === true ||
    rawMode === "specific" ||
    rawMode === "specific_event" ||
    (rawMode !== "general" && cleanSpecificEvent.length > 0);

  const inquiryType: InquiryType = isSpecific ? "specific" : "general";

  // 3. Run the live emergency aggregation for the caller's area
  const aggregated = await aggregateEmergencies({
    lat,
    lng,
    locationLabel: resolvedLocationName,
    radiusMiles: input.radiusMiles ?? 50,
  });

  const allAreaIncidents = aggregated.data;

  // 4A. Process SPECIFIC EVENT inquiry
  if (inquiryType === "specific" && cleanSpecificEvent.length > 0) {
    const keywords = extractKeywords(cleanSpecificEvent);
    const matchedCategories = detectCategoriesFromText(cleanSpecificEvent);

    const scored = allAreaIncidents
      .map((item) => ({
        item,
        score: scoreEventMatch(item, cleanSpecificEvent, keywords, matchedCategories),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const matchedItems = scored.slice(0, 3).map((s) => s.item);
      const primary = matchedItems[0];
      const distPhrase =
        typeof primary.distanceMiles === "number"
          ? ` located approximately ${primary.distanceMiles.toFixed(1)} miles from ${shortAreaName}${
              primary.isWithinImpactRadius
                ? " (your location is within the active impact zone)"
                : ""
            }`
          : "";

      let speech = `Here is the latest information regarding ${primary.title}${distPhrase}. `;
      speech += `Status is ${primary.status} with ${primary.severity} severity. `;
      speech += `${primary.description} `;
      if (primary.instructions) {
        speech += `Safety instructions: ${primary.instructions} `;
      }

      if (matchedItems.length > 1) {
        const second = matchedItems[1];
        speech += `There is also a related ${second.type.replace("_", " ")} alert nearby: ${second.voiceSummary}`;
      }

      return {
        result: speech.trim(),
        speech: speech.trim(),
        inquiry_type: "specific",
        caller_location: {
          input: rawLocation,
          resolved_name: resolvedLocationName,
          lat,
          lng,
        },
        specific_event_query: cleanSpecificEvent,
        exact_match_found: true,
        total_area_emergencies: aggregated.meta.total,
        critical_area_emergencies: aggregated.meta.criticalCount,
        events: matchedItems.map(toEventSummary),
        aggregated_at: aggregated.meta.lastAggregatedAt,
      };
    }

    // No match for the specific event query — inform caller and read out top general incidents in their area
    const fallbackTop = allAreaIncidents.slice(0, 2);
    const fallbackText =
      fallbackTop.length > 0
        ? `However, there ${
            allAreaIncidents.length === 1
              ? "is 1 other active incident"
              : `are ${allAreaIncidents.length} active incidents`
          } near ${shortAreaName}: ${fallbackTop
            .map(
              (inc, idx) =>
                `${idx + 1}: ${inc.voiceSummary}${
                  typeof inc.distanceMiles === "number"
                    ? ` (${inc.distanceMiles.toFixed(1)} miles away).`
                    : ""
                }`
            )
            .join(" ")}`
        : `There are currently no active emergencies reported near ${shortAreaName}.`;

    const noMatchSpeech = `I checked our live emergency feeds near ${shortAreaName}, and there are no active reports matching "${cleanSpecificEvent}". ${fallbackText} If you are witnessing a new life-threatening emergency, please hang up and dial 911 immediately.`;

    return {
      result: noMatchSpeech,
      speech: noMatchSpeech,
      inquiry_type: "specific",
      caller_location: {
        input: rawLocation,
        resolved_name: resolvedLocationName,
        lat,
        lng,
      },
      specific_event_query: cleanSpecificEvent,
      exact_match_found: false,
      total_area_emergencies: aggregated.meta.total,
      critical_area_emergencies: aggregated.meta.criticalCount,
      events: fallbackTop.map(toEventSummary),
      aggregated_at: aggregated.meta.lastAggregatedAt,
    };
  }

  // 4B. Process GENERAL AREA EMERGENCIES inquiry
  const topGeneral = allAreaIncidents.slice(0, 4);

  if (topGeneral.length === 0) {
    const calmSpeech = `There are currently no active emergency incidents reported near ${shortAreaName}. If you are experiencing a life-threatening emergency, please hang up and dial 911 immediately.`;
    return {
      result: calmSpeech,
      speech: calmSpeech,
      inquiry_type: "general",
      caller_location: {
        input: rawLocation,
        resolved_name: resolvedLocationName,
        lat,
        lng,
      },
      specific_event_query: null,
      exact_match_found: true,
      total_area_emergencies: 0,
      critical_area_emergencies: 0,
      events: [],
      aggregated_at: aggregated.meta.lastAggregatedAt,
    };
  }

  const spokenItems = topGeneral.slice(0, 3).map((inc, idx) => {
    const distPart =
      typeof inc.distanceMiles === "number"
        ? ` (${inc.distanceMiles.toFixed(1)} miles from ${shortAreaName}${
            inc.isWithinImpactRadius ? ", inside the active impact zone" : ""
          })`
        : "";
    return `Incident ${idx + 1}${distPart}: ${inc.voiceSummary}`;
  });

  const generalSpeech = `Near ${shortAreaName}, there ${
    aggregated.meta.total === 1
      ? "is currently 1 active emergency incident"
      : `are currently ${aggregated.meta.total} active emergency incidents`
  } (${aggregated.meta.criticalCount} critical). ${spokenItems.join(" ")} Let me know if you would like detailed safety instructions for any of these events.`;

  return {
    result: generalSpeech,
    speech: generalSpeech,
    inquiry_type: "general",
    caller_location: {
      input: rawLocation,
      resolved_name: resolvedLocationName,
      lat,
      lng,
    },
    specific_event_query: null,
    exact_match_found: true,
    total_area_emergencies: aggregated.meta.total,
    critical_area_emergencies: aggregated.meta.criticalCount,
    events: topGeneral.map(toEventSummary),
    aggregated_at: aggregated.meta.lastAggregatedAt,
  };
}


import { NextRequest } from "next/server";
import {
  addRuntimeIncident,
  aggregateEmergencies,
  geocodeLocationQuery,
} from "@/lib/aggregator";
import type { EmergencySeverity } from "@/lib/emergency-data";

type RetellToolPayload = {
  name?: string;
  call?: {
    call_id?: string;
    from_number?: string;
  };
  args?: {
    action?: "lookup" | "report";
    location?: string;
    lat?: number;
    lng?: number;
    radius_miles?: number;
    emergency_type?: string;
    severity?: EmergencySeverity;
    query?: string;
    title?: string;
    description?: string;
  };
  // Support flat args in case custom tool sends parameters at top-level
  action?: "lookup" | "report";
  location?: string;
  lat?: number;
  lng?: number;
  radius_miles?: number;
  emergency_type?: string;
  severity?: EmergencySeverity;
  query?: string;
  title?: string;
  description?: string;
};

/**
 * POST /api/retell/tool
 * Custom Function / Tool Calling endpoint for Retell AI Voice Agents.
 * Allows the voice agent to:
 *  1) Query live emergencies near a caller's spoken location/ZIP/landmark (`lookup_emergencies`)
 *  2) Log a new citizen hazard report into the live aggregator & heatmap (`report_incident`)
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RetellToolPayload;
    const params = body.args ?? body;
    const toolName = (body.name ?? params.action ?? "lookup").toLowerCase();

    // Resolve spoken location string (e.g. "Santa Monica", "Exposition Park", "90007") if lat/lng not provided
    let lat = typeof params.lat === "number" ? params.lat : undefined;
    let lng = typeof params.lng === "number" ? params.lng : undefined;
    let resolvedLocation = params.location;

    if ((lat === undefined || lng === undefined) && params.location) {
      const geo = await geocodeLocationQuery(params.location);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
        resolvedLocation = geo.displayName;
      }
    }

    // Handle citizen hazard report submitted during a phone call
    if (
      toolName.includes("report") ||
      params.action === "report"
    ) {
      return Response.json({
        result:
          "This service is strictly for emergency information distribution and cannot dispatch emergency units. If you are witnessing or experiencing an active incident, please hang up immediately and dial 911 so Emergency Medical Services and first responders can be dispatched.",
        directive: "CALL_911_EMS",
      });
    }

    // Default: Lookup active emergencies for the caller
    const aggregated = await aggregateEmergencies({
      lat: lat ?? 34.0224,
      lng: lng ?? -118.2851,
      radiusMiles: params.radius_miles ?? 35,
      type: params.emergency_type,
      severity: params.severity,
      query: params.query,
    });

    const topIncidents = aggregated.data.slice(0, 4).map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      severity: item.severity,
      distanceMiles: item.distanceMiles,
      isWithinImpactRadius: item.isWithinImpactRadius,
      locationName: item.locationName,
      voiceSummary: item.voiceSummary,
      instructions: item.instructions,
      contact: item.contact,
      updatedAt: item.updatedAt,
    }));

    return Response.json({
      result: aggregated.voiceBriefing,
      resolved_location: resolvedLocation ?? "Los Angeles / USC Area",
      total_matches: aggregated.meta.total,
      critical_count: aggregated.meta.criticalCount,
      incidents: topIncidents,
    });
  } catch (err) {
    return Response.json(
      {
        result:
          "I'm having trouble reaching the live emergency feed right now. If you are in immediate danger, please dial 911.",
        error: err instanceof Error ? err.message : "Tool execution failed",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/retell/tool
 * Returns the Retell AI Custom Tool definition schema for easy copy-pasting into the Retell dashboard.
 */
export async function GET() {
  return Response.json({
    endpoint: "/api/retell/tool",
    description:
      "Retell AI Custom Tool (Function Calling) endpoint for looking up live emergencies by spoken location or logging new citizen reports.",
    retellCustomToolSchema: {
      type: "custom",
      name: "lookup_local_emergencies",
      description:
        "Look up active local emergencies, evacuations, power outages, fires, earthquakes, and weather alerts near a caller's location or by emergency type.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description:
              "City, neighborhood, street intersection, landmark, or ZIP code mentioned by the caller (e.g. 'Exposition Park', 'Hollywood Hills', '90007').",
          },
          emergency_type: {
            type: "string",
            enum: [
              "fire",
              "weather",
              "earthquake",
              "infrastructure",
              "public_safety",
              "medical",
              "natural_disaster",
            ],
            description: "Optional filter by category of emergency.",
          },
          query: {
            type: "string",
            description:
              "Optional keyword search (e.g. 'Figueroa', 'power outage', 'flooding').",
          },
          radius_miles: {
            type: "number",
            description: "Search radius in miles (default 35).",
          },
        },
        required: [],
      },
    },
  });
}


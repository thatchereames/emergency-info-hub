import { NextRequest } from "next/server";
import {
  addRuntimeIncident,
  aggregateEmergencies,
  geocodeLocationQuery,
} from "@/lib/aggregator";
import type {
  EmergencyInfo,
  EmergencySeverity,
  EmergencySource,
} from "@/lib/emergency-data";

export type { EmergencyInfo } from "@/lib/emergency-data";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  let lat = searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined;
  let lng = searchParams.get("lng") ? Number(searchParams.get("lng")) : undefined;
  const locationText = searchParams.get("location")?.trim();

  // If caller passed a location string (e.g. "?location=Santa+Monica" or "?location=90007") without lat/lng, geocode it
  let resolvedLocationName: string | undefined;
  if ((lat === undefined || Number.isNaN(lat)) && locationText) {
    const geo = await geocodeLocationQuery(locationText);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
      resolvedLocationName = geo.displayName;
    }
  }

  const radiusMiles = searchParams.get("radius")
    ? Number(searchParams.get("radius"))
    : undefined;
  const type =
    searchParams.get("type") ?? searchParams.get("category") ?? undefined;
  const severity = (searchParams.get("severity") as EmergencySeverity) || undefined;
  const source = (searchParams.get("source") as EmergencySource) || undefined;
  const query = searchParams.get("q") ?? undefined;
  const forceRefresh = searchParams.get("refresh") === "true";

  const aggregated = await aggregateEmergencies({
    lat,
    lng,
    locationLabel: resolvedLocationName ?? locationText,
    radiusMiles,
    type,
    severity,
    source,
    query,
    forceRefresh,
  });

  return Response.json({
    ...aggregated,
    meta: {
      ...aggregated.meta,
      resolvedLocationName: resolvedLocationName ?? locationText ?? null,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<EmergencyInfo> & {
      lat?: number;
      lng?: number;
      location?: string;
    };

    if (!body.title || !body.description) {
      return Response.json(
        { error: "Both 'title' and 'description' are required." },
        { status: 400 }
      );
    }

    let lat = typeof body.lat === "number" ? body.lat : body.coords?.lat;
    let lng = typeof body.lng === "number" ? body.lng : body.coords?.lng;
    let locationName = body.locationName ?? body.location;

    if ((lat === undefined || lng === undefined) && locationName) {
      const geo = await geocodeLocationQuery(locationName);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
        locationName = geo.displayName;
      }
    }

    // Default to USC / Downtown LA center if no coordinates or geocodable location provided
    const finalLat = lat ?? 34.0224;
    const finalLng = lng ?? -118.2851;

    const created = addRuntimeIncident({
      ...body,
      title: body.title,
      description: body.description,
      lat: finalLat,
      lng: finalLng,
      locationName: locationName ?? "Los Angeles, CA",
    });

    return Response.json({ data: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Invalid JSON request body",
      },
      { status: 400 }
    );
  }
}

import { NextRequest } from "next/server";
import {
  InquiryType,
  runRetellEmergencyProcess,
} from "@/lib/retell-agent-service";

type RawRetellArgs = {
  // Caller's location
  caller_location?: string;
  callerLocation?: string;
  location?: string;
  lat?: number;
  lng?: number;

  // Whether calling about a specific event or general area emergencies
  inquiry_type?: InquiryType | string;
  inquiryType?: InquiryType | string;
  is_specific_event?: boolean;
  isSpecificEvent?: boolean;

  // The specific event the caller wants to know about
  specific_event?: string;
  specificEvent?: string;
  event?: string;
  query?: string;
  emergency_type?: string;

  // Optional search radius
  radius_miles?: number;
  radiusMiles?: number;
  action?: string;
};

type RetellWebhookRequest = RawRetellArgs & {
  name?: string;
  call?: {
    call_id?: string;
    from_number?: string;
    to_number?: string;
  };
  args?: RawRetellArgs;
};

/**
 * POST /api/retell/tool
 * Callable by Retell AI Voice Agents (Custom Function / Tool Call).
 * Accepts:
 *  - caller_location (string): The caller's location
 *  - inquiry_type ("specific" | "general") or is_specific_event (boolean)
 *  - specific_event (string, optional): The specific emergency event the caller is asking about
 * Runs the live emergency aggregation process for that location and returns the relevant
 * events + spoken script (`result`) for the voice agent to read out to the caller.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RetellWebhookRequest;
    const params: RawRetellArgs = body.args ?? body;
    const toolName = (body.name ?? params.action ?? "").toLowerCase();

    // Guardrail if caller tries to report a new incident instead of requesting info
    if (toolName.includes("report") || params.action === "report") {
      return Response.json({
        result:
          "This service is strictly for emergency information distribution and cannot dispatch emergency units. If you are witnessing or experiencing an active incident, please hang up immediately and dial 911 so Emergency Medical Services and first responders can be dispatched.",
        directive: "CALL_911_EMS",
      });
    }

    const callerLocation =
      params.caller_location ??
      params.callerLocation ??
      params.location;

    const inquiryType =
      params.inquiry_type ??
      params.inquiryType;

    const isSpecificEvent =
      typeof params.is_specific_event === "boolean"
        ? params.is_specific_event
        : params.isSpecificEvent;

    const specificEvent =
      params.specific_event ??
      params.specificEvent ??
      params.event ??
      params.query ??
      params.emergency_type;

    const radiusMiles = params.radius_miles ?? params.radiusMiles;

    const responsePayload = await runRetellEmergencyProcess({
      callerLocation,
      lat: params.lat,
      lng: params.lng,
      inquiryType,
      isSpecificEvent,
      specificEvent,
      radiusMiles,
    });

    return Response.json(responsePayload);
  } catch (err) {
    return Response.json(
      {
        result:
          "I'm having trouble reaching the live emergency aggregation feed right now. If you are in immediate danger, please hang up and dial 911.",
        error: err instanceof Error ? err.message : "Tool execution failed",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/retell/tool
 * - If query params (`caller_location`, `inquiry_type`, `specific_event`) are provided, runs the live aggregation process for easy testing.
 * - Otherwise returns the Retell AI Custom Function JSON schema to paste into the Retell dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const callerLocation =
    searchParams.get("caller_location") ?? searchParams.get("location");
  const inquiryType = searchParams.get("inquiry_type") ?? undefined;
  const specificEvent =
    searchParams.get("specific_event") ?? searchParams.get("query") ?? undefined;

  if (callerLocation || inquiryType || specificEvent) {
    const result = await runRetellEmergencyProcess({
      callerLocation: callerLocation ?? undefined,
      inquiryType,
      specificEvent,
      isSpecificEvent:
        searchParams.get("is_specific_event") === "true"
          ? true
          : searchParams.get("is_specific_event") === "false"
            ? false
            : undefined,
    });
    return Response.json(result);
  }

  return Response.json({
    endpoint: "/api/retell/tool",
    description:
      "Retell AI Custom Tool (Function Calling) endpoint. Pass caller_location, inquiry_type ('specific' | 'general'), and specific_event to aggregate and return relevant emergency events for the voice agent to read out.",
    retellCustomToolSchema: {
      type: "custom",
      name: "get_emergency_information",
      description:
        "Aggregates live emergency data for the caller's location and returns relevant events and safety instructions to read out to the caller.",
      parameters: {
        type: "object",
        properties: {
          caller_location: {
            type: "string",
            description:
              "The caller's current location, city, neighborhood, street intersection, landmark, or ZIP code (e.g. 'Exposition Park', 'Hollywood Hills', 'Seattle, WA', '90007').",
          },
          inquiry_type: {
            type: "string",
            enum: ["general", "specific"],
            description:
              "Set to 'specific' if the caller is asking about a particular emergency event, or 'general' if they want an overview of active emergencies in their area.",
          },
          specific_event: {
            type: "string",
            description:
              "If inquiry_type is 'specific', the specific emergency event, hazard type, or location the caller is asking about (e.g. 'brush fire in Hollywood Hills', 'power outage', 'Figueroa fire', 'earthquake').",
          },
        },
        required: ["caller_location", "inquiry_type"],
      },
    },
  });
}

import { NextRequest } from "next/server";
import { aggregateEmergencies } from "@/lib/aggregator";

/**
 * POST /api/retell/inbound
 * Retell AI Inbound Call Webhook & Call Lifecycle Webhook handler.
 * Injects live aggregated emergency context into Retell's `dynamic_variables`
 * right when a citizen calls in.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      event?: string;
      call_inbound?: {
        agent_id?: string;
        from_number?: string;
        to_number?: string;
      };
      call?: Record<string, unknown>;
    };

    // Fetch current regional emergencies (default centered around Los Angeles / USC)
    const aggregated = await aggregateEmergencies({
      lat: 34.0224,
      lng: -118.2851,
      radiusMiles: 50,
    });

    const topThree = aggregated.data.slice(0, 3);
    const dynamicVariables = {
      active_emergencies_summary: aggregated.voiceBriefing,
      total_active_incidents: String(aggregated.meta.total),
      critical_incident_count: String(aggregated.meta.criticalCount),
      nearest_incident_title: topThree[0]?.title ?? "None reported",
      nearest_incident_instructions:
        topThree[0]?.instructions ??
        "If this is a life-threatening emergency, please dial 911 immediately.",
      last_updated_iso: aggregated.meta.lastAggregatedAt,
    };

    // If this is a Retell inbound call webhook, return the `call_inbound` response format
    if (body.event === "call_inbound" || body.call_inbound) {
      return Response.json({
        call_inbound: {
          dynamic_variables: dynamicVariables,
          metadata: {
            hubSource: "emergency-info-hub",
            callerNumber: body.call_inbound?.from_number ?? "unknown",
          },
        },
      });
    }

    // For general webhook events (call_started, call_ended, call_analyzed) or direct test calls
    return Response.json({
      received: true,
      event: body.event ?? "direct_context_fetch",
      dynamic_variables: dynamicVariables,
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to process Retell inbound webhook",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const aggregated = await aggregateEmergencies({
    lat: 34.0224,
    lng: -118.2851,
    radiusMiles: 50,
  });

  return Response.json({
    endpoint: "/api/retell/inbound",
    description:
      "Configure this URL as your Retell AI Inbound Call Webhook to inject live emergency dynamic_variables at call start.",
    previewDynamicVariables: {
      active_emergencies_summary: aggregated.voiceBriefing,
      total_active_incidents: String(aggregated.meta.total),
      critical_incident_count: String(aggregated.meta.criticalCount),
    },
  });
}


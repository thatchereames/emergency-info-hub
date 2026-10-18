export type EmergencySeverity = "low" | "moderate" | "severe" | "extreme";

export type EmergencyCategory =
  | "fire"
  | "weather"
  | "earthquake"
  | "medical"
  | "infrastructure"
  | "public_safety"
  | "natural_disaster";

export type EmergencySource =
  | "NWS"
  | "USGS"
  | "EONET"
  | "LOCAL_DISPATCH"
  | "CITIZEN_REPORT"
  | "STATIC_RESOURCE";

export type EmergencyStatus = "active" | "monitoring" | "contained" | "resolved";

export type EmergencyInfo = {
  id: string;
  type: EmergencyCategory | string;
  title: string;
  description: string;
  instructions: string;
  contact: string;
  updatedAt: string;
  startedAt: string;
  source: EmergencySource;
  status: EmergencyStatus;
  severity: EmergencySeverity;
  /** Normalized 0.0 - 1.0 weight used by the heatmap for intensity */
  severityWeight: number;
  /** Estimated impact radius in miles for heatmap spread & proximity matching */
  radiusMiles: number;
  coords: {
    lat: number;
    lng: number;
  };
  locationName: string;
  affectedAreas: string[];
  /** Concise, voice-friendly summary optimized for Retell AI phone agents */
  voiceSummary: string;
  distanceMiles?: number;
  isWithinImpactRadius?: boolean;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
};

export type HeatmapPoint = {
  id: string;
  lat: number;
  lng: number;
  /** 0.0 - 1.0 intensity based on severity */
  intensity: number;
  /** Impact radius in miles */
  radiusMiles: number;
  severity: EmergencySeverity;
  type: string;
  title: string;
};

export const SEVERITY_WEIGHTS: Record<EmergencySeverity, number> = {
  low: 0.3,
  moderate: 0.55,
  severe: 0.8,
  extreme: 1.0,
};

/**
 * Haversine distance between two [lat, lng] coordinates in miles.
 */
export function distanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Local 911 / CAD Dispatch & Citizen Reports (Seed Data + Runtime Store)
 * Centered around Los Angeles / USC (34.0224, -118.2851) so local queries and
 * demos immediately show realistic multi-severity incidents on the heatmap and voice line.
 */
export const localDispatchReports: EmergencyInfo[] = [
  {
    id: "local-fire-101",
    type: "fire",
    title: "2-Alarm Commercial Structure Fire — South Figueroa St",
    description:
      "LAFD units are actively fighting a 2-alarm commercial building fire near S Figueroa St & W Exposition Blvd. Heavy smoke reported in the area; northbound lanes on Figueroa are closed between Exposition and 37th Pl.",
    instructions:
      "Avoid S Figueroa St between Exposition Blvd and W 37th Pl. Residents within 0.5 miles should keep windows closed due to smoke. No residential evacuation orders are in effect at this time.",
    contact: "LAFD Info: 213-485-5162 | Life Threatening: 911",
    startedAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    source: "LOCAL_DISPATCH",
    status: "active",
    severity: "severe",
    severityWeight: SEVERITY_WEIGHTS.severe,
    radiusMiles: 1.5,
    coords: { lat: 34.0185, lng: -118.2812 },
    locationName: "Exposition Park / South Figueroa St, Los Angeles, CA",
    affectedAreas: ["Exposition Park", "University Park", "S Figueroa Corridor"],
    voiceSummary:
      "There is an active two-alarm commercial fire near South Figueroa Street and Exposition Boulevard in Exposition Park. Fire crews are on scene and northbound Figueroa is closed. No evacuations are ordered, but nearby residents should avoid the intersection and close windows if they smell smoke.",
    metadata: { unitsAssigned: 14, alarmLevel: 2 },
  },
  {
    id: "local-infra-102",
    type: "infrastructure",
    title: "LADWP Power Outage & Downed Line — West Adams",
    description:
      "A transformer failure and downed primary line near W Adams Blvd & Normandie Ave has left approximately 1,850 customers without power. Traffic signals at Normandie and Adams are flashing red.",
    instructions:
      "Treat all dark intersections as four-way stops. Stay at least 30 feet away from any downed wires. LADWP repair crews estimate restoration within 3 hours.",
    contact: "LADWP Outage Line: 1-800-342-5397",
    startedAt: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    source: "LOCAL_DISPATCH",
    status: "active",
    severity: "moderate",
    severityWeight: SEVERITY_WEIGHTS.moderate,
    radiusMiles: 1.8,
    coords: { lat: 34.0326, lng: -118.3003 },
    locationName: "West Adams & Normandie Ave, Los Angeles, CA",
    affectedAreas: ["West Adams", "Harvard Heights", "North University Park"],
    voiceSummary:
      "An active LADWP power outage is affecting about 1,850 customers near West Adams Boulevard and Normandie Avenue. Crews are on scene and estimate power restoration within 3 hours. Treat any dark traffic lights as a four-way stop.",
    metadata: { customersAffected: 1850, estimatedRestorationHours: 3 },
  },
  {
    id: "local-wildfire-103",
    type: "fire",
    title: "Brush Fire (Hollywood Hills / Griffith Park West)",
    description:
      "A 18-acre wind-driven brush fire is burning in steep terrain on the western slope of Griffith Park. Air tankers and ground crews are holding the fire east of Cahuenga Blvd. Evacuation warnings issued for select hillside streets.",
    instructions:
      "Evacuation Warning in effect for zones north of Franklin Ave and east of Cahuenga Blvd. Prepare go-bags, pets, and medications. Monitor LAFD alerts for potential upgrade to mandatory evacuation.",
    contact: "LA Emergency Management: 213-978-2222 | 911",
    startedAt: new Date(Date.now() - 130 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    source: "LOCAL_DISPATCH",
    status: "active",
    severity: "extreme",
    severityWeight: SEVERITY_WEIGHTS.extreme,
    radiusMiles: 3.5,
    coords: { lat: 34.1285, lng: -118.3135 },
    locationName: "Griffith Park West / Hollywood Hills, Los Angeles, CA",
    affectedAreas: ["Hollywood Hills East", "Griffith Park", "Cahuenga Pass"],
    voiceSummary:
      "There is an active 18-acre brush fire on the western side of Griffith Park in the Hollywood Hills. An evacuation warning is in place for hillside streets north of Franklin Avenue and east of Cahuenga Boulevard. Air tankers and ground crews are actively fighting the fire.",
    metadata: { acresBurned: 18, containmentPercent: 25 },
  },
  {
    id: "citizen-flood-104",
    type: "infrastructure",
    title: "Water Main Break & Street Flooding — Downtown LA (8th & Broadway)",
    description:
      "Multiple citizen callers and DOT cameras report a ruptured 12-inch water main flooding the intersection of W 8th St and S Broadway. Water is curb-high; bus routes are detoured.",
    instructions:
      "Do not drive through standing water on 8th St between Hill St and Spring St. Expect 20-minute transit delays in Downtown LA.",
    contact: "LA 311 / LADWP: 311",
    startedAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    source: "CITIZEN_REPORT",
    status: "monitoring",
    severity: "moderate",
    severityWeight: SEVERITY_WEIGHTS.moderate,
    radiusMiles: 0.9,
    coords: { lat: 34.0434, lng: -118.2562 },
    locationName: "W 8th St & S Broadway, Downtown Los Angeles, CA",
    affectedAreas: ["Downtown LA", "Historic Core", "Fashion District"],
    voiceSummary:
      "A water main break is causing street flooding at West 8th Street and South Broadway in Downtown Los Angeles. Avoid driving through standing water and expect bus detours in the area.",
    metadata: { callerReportsCount: 9 },
  },
  {
    id: "citizen-hazmat-105",
    type: "public_safety",
    title: "Multi-Vehicle Collision & Fuel Spill — I-10 Eastbound at Hoover St",
    description:
      "CHP and LAFD Hazmat are clearing a 3-vehicle collision with a minor diesel spill on I-10 Eastbound near the Hoover St / Vermont Ave exits. Three right lanes are blocked.",
    instructions:
      "Use Adams Blvd or Olympic Blvd as alternate east-west routes. Expect heavy congestion on I-10 Eastbound for the next 45 minutes.",
    contact: "CHP Non-Emergency: 1-800-835-5247 | 511",
    startedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    source: "LOCAL_DISPATCH",
    status: "active",
    severity: "severe",
    severityWeight: SEVERITY_WEIGHTS.severe,
    radiusMiles: 2.0,
    coords: { lat: 34.0378, lng: -118.2841 },
    locationName: "I-10 Eastbound at Hoover St, Los Angeles, CA",
    affectedAreas: ["Pico-Union", "I-10 Corridor", "University Park North"],
    voiceSummary:
      "A multi-vehicle collision and minor fuel spill on Interstate 10 Eastbound near Hoover Street has blocked three right lanes. Drivers should use Olympic or Adams Boulevard as alternates.",
    metadata: { lanesBlocked: 3 },
  },
];

// Backward-compatible export for existing imports
export const emergencyData: EmergencyInfo[] = localDispatchReports;

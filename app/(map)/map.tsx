"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { EmergencyInfo, EmergencySeverity } from "@/lib/emergency-data";

const userLocationIcon = L.divIcon({
  className: "user-loc-icon",
  html: `
    <div style="position:relative; width:22px; height:22px; display:flex; align-items:center; justify-content:center;">
      <div style="position:absolute; width:22px; height:22px; border-radius:50%; background:#3b82f6; opacity:0.35; animation: ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div style="position:relative; width:12px; height:12px; border-radius:50%; background:#2563eb; border:2.5px solid #ffffff; box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>
    </div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const SEVERITY_COLORS: Record<
  EmergencySeverity,
  { stroke: string; fill: string; badgeBg: string; text: string }
> = {
  extreme: { stroke: "#b91c1c", fill: "#ef4444", badgeBg: "#dc2626", text: "#ffffff" },
  severe: { stroke: "#c2410c", fill: "#f97316", badgeBg: "#ea580c", text: "#ffffff" },
  moderate: { stroke: "#b45309", fill: "#f59e0b", badgeBg: "#d97706", text: "#ffffff" },
  low: { stroke: "#0369a1", fill: "#38bdf8", badgeBg: "#0284c7", text: "#ffffff" },
};

const CATEGORY_EMOJIS: Record<string, string> = {
  fire: "🔥",
  weather: "⛈️",
  earthquake: "⚡",
  infrastructure: "⚠️",
  public_safety: "🚨",
  medical: "🚑",
  natural_disaster: "🌊",
};

function createIncidentMarkerIcon(incident: EmergencyInfo) {
  const sev = SEVERITY_COLORS[incident.severity] ?? SEVERITY_COLORS.moderate;
  const emoji = CATEGORY_EMOJIS[incident.type] ?? "⚠️";

  return L.divIcon({
    className: `emergency-marker-${incident.id}`,
    html: `
      <div style="
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: ${sev.fill};
        border: 2px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        font-size: 15px;
        cursor: pointer;
        transition: transform 0.15s ease;
      ">
        <span>${emoji}</span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

type Props = {
  center: [number, number];
  label: string;
  incidents: EmergencyInfo[];
  showHeatmap?: boolean;
  selectedIncidentId?: string | null;
  onSelectIncident?: (incident: EmergencyInfo) => void;
};

export default function Map({
  center,
  label,
  incidents,
  showHeatmap = true,
  selectedIncidentId,
  onSelectIncident,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelectIncident);
  onSelectRef.current = onSelectIncident;

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
    }).setView(center, 13);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    // Group for dynamic hazard layers (circles + incident markers)
    const layersGroup = L.layerGroup().addTo(map);
    layersGroupRef.current = layersGroup;

    // User center marker
    const userMarker = L.marker(center, { icon: userLocationIcon })
      .addTo(map)
      .bindPopup(`<strong>Your Location</strong><br/><span style="font-size:12px;color:#555;">${label}</span>`);
    userMarkerRef.current = userMarker;

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update center view and user marker when center changes
  useEffect(() => {
    const map = mapRef.current;
    const userMarker = userMarkerRef.current;
    if (!map || !userMarker) return;

    map.setView(center, map.getZoom() || 13);
    userMarker.setLatLng(center);
    userMarker.setPopupContent(
      `<strong>Your Location</strong><br/><span style="font-size:12px;color:#555;">${label}</span>`
    );
  }, [center, label]);

  // Render heatmap impact zones and incident markers when incidents or showHeatmap changes
  useEffect(() => {
    const map = mapRef.current;
    const group = layersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    incidents.forEach((item) => {
      const coords: [number, number] = [item.coords.lat, item.coords.lng];
      const sev = SEVERITY_COLORS[item.severity] ?? SEVERITY_COLORS.moderate;
      const radiusMeters = item.radiusMiles * 1609.34;

      // 1. Heatmap / Hazard Impact Zone (Outer gradient plume + intense inner core)
      if (showHeatmap && radiusMeters > 0) {
        // Outer falloff ring
        const outerCircle = L.circle(coords, {
          radius: radiusMeters,
          color: sev.stroke,
          weight: 1.5,
          opacity: 0.6,
          fillColor: sev.fill,
          fillOpacity: item.severityWeight * 0.22,
          dashArray: item.status === "monitoring" ? "4, 4" : undefined,
        });

        // Inner intense hazard core (50% radius)
        const innerCircle = L.circle(coords, {
          radius: radiusMeters * 0.45,
          color: sev.stroke,
          weight: 1,
          opacity: 0.8,
          fillColor: sev.fill,
          fillOpacity: item.severityWeight * 0.38,
        });

        const clickHandler = () => {
          if (onSelectRef.current) {
            onSelectRef.current(item);
          }
        };

        outerCircle.on("click", clickHandler);
        innerCircle.on("click", clickHandler);

        group.addLayer(outerCircle);
        group.addLayer(innerCircle);
      }

      // 2. Interactive Incident Marker Pin
      const marker = L.marker(coords, {
        icon: createIncidentMarkerIcon(item),
      });

      const popupHtml = `
        <div style="min-width: 200px; font-family: inherit;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <span style="
              background:${sev.badgeBg};
              color:${sev.text};
              font-size:10px;
              font-weight:700;
              text-transform:uppercase;
              padding:2px 6px;
              border-radius:999px;
            ">${item.severity}</span>
            <span style="font-size:11px; color:#6b7280; text-transform:capitalize;">${item.type.replace("_", " ")}</span>
          </div>
          <h4 style="font-size:13px; font-weight:700; margin:0 0 4px 0; color:#111827; line-height:1.3;">
            ${item.title}
          </h4>
          <p style="font-size:12px; color:#4b5563; margin:0 0 6px 0; line-height:1.4;">
            ${item.description.slice(0, 150)}${item.description.length > 150 ? "…" : ""}
          </p>
          <div style="font-size:11px; color:#6b7280; margin-bottom:8px;">
            📍 ${item.locationName} &bull; Radius: ${item.radiusMiles} mi
          </div>
          <a
            href="tel:${item.contact.replace(/\D/g, "") || "911"}"
            style="
              display:inline-block;
              background:#111827;
              color:#ffffff;
              padding:4px 8px;
              font-size:11px;
              font-weight:600;
              border-radius:6px;
              text-decoration:none;
            "
          >
            Call ${item.contact}
          </a>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on("click", () => {
        if (onSelectRef.current) {
          onSelectRef.current(item);
        }
      });

      group.addLayer(marker);
    });
  }, [incidents, showHeatmap]);

  // Focus on selected incident if triggered externally
  useEffect(() => {
    if (!selectedIncidentId || !mapRef.current) return;
    const target = incidents.find((i) => i.id === selectedIncidentId);
    if (target) {
      mapRef.current.flyTo([target.coords.lat, target.coords.lng], 14, {
        duration: 0.8,
      });
    }
  }, [selectedIncidentId, incidents]);

  return (
    <div style={{ height: "100%", width: "100%", minHeight: "50vh", isolation: "isolate" }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type Props = {
  center: [number, number];
  label: string;
};

export default function Map({ center, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Create map on mount, destroy on unmount
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current).setView(center, 13);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    L.marker(center, { icon: defaultIcon }).addTo(map).bindPopup(label).openPopup();

    return () => {
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update view and marker when center/label change without remounting
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(center, 13);
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });
    L.marker(center, { icon: defaultIcon }).addTo(map).bindPopup(label).openPopup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], label]);

  return <div ref={containerRef} style={{ height: "500px", width: "100%", zIndex: "2" }} />;
}

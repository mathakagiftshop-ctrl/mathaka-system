"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type MapMarker = {
  lat: number;
  lng: number;
  /** Relative size, e.g. number of orders. */
  weight: number;
  color: string;
  title: string;
  lines: string[];
  href?: string;
};

/** Sri Lanka with circle markers. Loads Leaflet only in the browser. */
export function SriLankaMap({ markers, className = "map" }: { markers: MapMarker[]; className?: string }) {
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | undefined;
    (async () => {
      const L = await import("leaflet");
      if (disposed || !element.current) return;
      map = L.map(element.current, { scrollWheelZoom: false, minZoom: 6, maxBounds: [[4.5, 78.5], [10.5, 83]], zoomSnap: 0.25 });
      map.fitBounds([[5.92, 79.65], [9.84, 81.88]], { padding: [8, 8] });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 16,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const max = Math.max(1, ...markers.map((marker) => marker.weight));
      for (const marker of markers) {
        const radius = 6 + Math.sqrt(marker.weight / max) * 18;
        const circle = L.circleMarker([marker.lat, marker.lng], {
          radius, color: "#fff", weight: 2, fillColor: marker.color, fillOpacity: 0.78,
        }).addTo(map);
        const popup = document.createElement("div");
        const title = document.createElement(marker.href ? "a" : "strong");
        title.textContent = marker.title;
        if (marker.href && title instanceof HTMLAnchorElement) { title.href = marker.href; title.style.fontWeight = "700"; }
        popup.append(title);
        for (const line of marker.lines) {
          const row = document.createElement("div");
          row.textContent = line;
          popup.append(row);
        }
        circle.bindPopup(popup);
        circle.bindTooltip(marker.title);
      }
    })();
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [markers]);

  return <div ref={element} className={className} role="img" aria-label="Map of Sri Lanka" />;
}

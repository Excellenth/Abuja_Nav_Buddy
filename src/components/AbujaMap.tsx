import { useEffect, useRef } from "react";
import type { Place } from "@/data/abuja-places";

type Props = {
  from?: Place | null;
  to?: Place | null;
  routeCoords?: [number, number][]; // [lat, lng]
  pickMode?: boolean;
  onPick?: (lat: number, lng: number) => void;
};

const ABUJA_CENTER: [number, number] = [9.0765, 7.4986];

export function AbujaMap({ from, to, routeCoords, pickMode, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<{
    L?: typeof import("leaflet");
    map?: import("leaflet").Map;
    markers: import("leaflet").Marker[];
    line?: import("leaflet").Polyline;
  }>({ markers: [] });

  // Init map on client only
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current || stateRef.current.map) return;
      const map = L.map(containerRef.current, {
        center: ABUJA_CENTER,
        zoom: 12,
        zoomControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      stateRef.current.L = L;
      stateRef.current.map = map;
      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        if (stateRef.current.pickMode) {
          stateRef.current.onPick?.(e.latlng.lat, e.latlng.lng);
        }
      });
      // Force paint after layout
      setTimeout(() => map.invalidateSize(), 50);
      renderOverlay();
    })();
    return () => {
      cancelled = true;
      stateRef.current.map?.remove();
      stateRef.current = { markers: [] };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render overlay when inputs change
  useEffect(() => {
    renderOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.id, to?.id, routeCoords]);

  function renderOverlay() {
    const { L, map } = stateRef.current;
    if (!L || !map) return;

    stateRef.current.markers.forEach((m) => m.remove());
    stateRef.current.markers = [];
    stateRef.current.line?.remove();
    stateRef.current.line = undefined;

    const pin = (label: string, color: string) =>
      L.divIcon({
        className: "",
        html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">
          <div style="background:${color};color:white;padding:4px 9px;border-radius:9999px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.2);border:2px solid white">${label}</div>
          <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${color};margin-top:-1px"></div>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

    const bounds: [number, number][] = [];
    if (from) {
      const m = L.marker([from.lat, from.lng], { icon: pin(from.name, "#0a7a3b") }).addTo(map);
      stateRef.current.markers.push(m);
      bounds.push([from.lat, from.lng]);
    }
    if (to) {
      const m = L.marker([to.lat, to.lng], { icon: pin(to.name, "#b23a48") }).addTo(map);
      stateRef.current.markers.push(m);
      bounds.push([to.lat, to.lng]);
    }
    if (routeCoords && routeCoords.length > 1) {
      stateRef.current.line = L.polyline(routeCoords, {
        color: "#0a7a3b",
        weight: 5,
        opacity: 0.85,
      }).addTo(map);
      routeCoords.forEach((c) => bounds.push(c));
    }
    if (bounds.length >= 2) {
      map.fitBounds(bounds, { padding: [40, 40] });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    }
  }

  return <div ref={containerRef} className="h-full w-full" aria-label="Map of Abuja" />;
}

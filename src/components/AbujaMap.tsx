import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type Place = {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  description?: string;
};

type Props = {
  places: Place[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
};

// Abuja city center (near Millennium Park / Central Business District)
const ABUJA_CENTER: [number, number] = [9.0765, 7.4986];

export function AbujaMap({ places, activeId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const userMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: ABUJA_CENTER,
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;

    // Try to locate user
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 0 0 3px rgba(37,99,235,.35)"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          });
          userMarkerRef.current = L.marker([latitude, longitude], { icon })
            .addTo(map)
            .bindPopup("You are here");
        },
        () => {},
        { enableHighAccuracy: true, timeout: 6000 },
      );
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync markers with places
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    places.forEach((p) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;">
          <div style="background:#0a7a3b;color:white;padding:4px 8px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.15);border:2px solid white;">${p.name}</div>
          <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #0a7a3b;margin-top:-1px;"></div>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
      marker.bindPopup(
        `<strong>${p.name}</strong><br/><span style="color:#0a7a3b;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">${p.category}</span>${p.description ? `<br/><span>${p.description}</span>` : ""}`,
      );
      marker.on("click", () => onSelect?.(p.id));
      markersRef.current[p.id] = marker;
    });
  }, [places, onSelect]);

  // Focus active
  useEffect(() => {
    if (!activeId) return;
    const marker = markersRef.current[activeId];
    const map = mapRef.current;
    if (marker && map) {
      map.flyTo(marker.getLatLng(), 15, { duration: 0.8 });
      marker.openPopup();
    }
  }, [activeId]);

  return <div ref={containerRef} className="h-full w-full" aria-label="Map of Abuja" />;
}

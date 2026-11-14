import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ReactNode } from "react";

export type Pin = { id: string; lat: number; lng: number; label: string; kind: "donor" | "request" | "bank" | "me" | "post" | "pick"; popup?: ReactNode };

const COLORS: Record<Pin["kind"], string> = { donor: "#dc2626", request: "#ea580c", bank: "#2563eb", me: "#111827", post: "#16a34a", pick: "#dc2626" };
const icon = (p: Pin) => L.divIcon({
  className: "",
  iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30],
  html: `<div style="background:${COLORS[p.kind]};color:#fff;border:2px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.25);border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:34px;height:34px;display:grid;place-items:center"><span style="transform:rotate(45deg);font:700 10px Inter,system-ui">${p.label}</span></div>`,
});

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function MapView({ pins, center, radiusKm, height = 420, onPick }: { pins: Pin[]; center: { lat: number; lng: number }; radiusKm?: number; height?: number; onPick?: (lat: number, lng: number) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100" style={{ height }}>
      <MapContainer center={[center.lat, center.lng]} zoom={12} scrollWheelZoom style={{ height: "100%", width: "100%" }} key={`${center.lat.toFixed(3)}-${center.lng.toFixed(3)}`}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {radiusKm ? <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} pathOptions={{ color: "#dc2626", fillColor: "#fecaca", fillOpacity: 0.15, weight: 1 }} /> : null}
        {pins.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icon(p)}>{p.popup ? <Popup>{p.popup}</Popup> : null}</Marker>
        ))}
        {onPick ? <ClickPicker onPick={onPick} /> : null}
      </MapContainer>
    </div>
  );
}

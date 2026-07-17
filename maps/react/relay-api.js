// relay-api.js — framework-agnostic calls to the Lumen maps relay + shared geometry/bounds.
// Used by RelayMap.jsx (and the demo). No React, no Leaflet. See ../README.md.

export const DEFAULT_BASE = 'https://api.lumencredits.com';
export const MIN_R = 50, MAX_R = 1000, DEFAULT_R = 150, MAX_CIRCLES = 25;
export const FALLBACK_CENTER = [32.0719, 34.7915];        // Tel Aviv (guide §5)
export const clampRadius = (r) => Math.max(MIN_R, Math.min(MAX_R, Math.round(r)));

// Destination point at distance (m) + bearing (deg) — places the east resize handle.
export function destPoint(lat, lng, distM, bearingDeg) {
  const R = 6378137, br = bearingDeg * Math.PI / 180;
  const la = lat * Math.PI / 180, lo = lng * Math.PI / 180, d = distM / R;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
  const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la),
                              Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [la2 * 180 / Math.PI, ((lo2 * 180 / Math.PI) + 540) % 360 - 180];
}

// Metres between two [lat,lng] points (Haversine) — resize uses this.
export function distanceM(a, b) {
  const R = 6378137, toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function placesSearch(base, key, q, near, lang) {
  const p = new URLSearchParams({ q });
  if (near) p.set('near', `${near[0]},${near[1]}`);
  if (lang) p.set('lang', lang);
  const r = await fetch(`${base}/google-map/places/search?${p}`, {
    headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error('HTTP ' + r.status);          // 402 = out of credit
  return (await r.json()).candidates || [];
}

export async function reverseGeocode(base, key, lat, lng, lang) {
  const p = new URLSearchParams({ latlng: `${lat},${lng}` });
  if (lang) p.set('lang', lang);
  const r = await fetch(`${base}/google-map/geocode?${p}`, {
    headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json()).results?.[0]?.address || null;
}

// IP geolocation (no permission, city-level). Returns [lat,lng] or null.
export async function ipLocate() {
  try {
    const j = await (await fetch('https://ipwho.is/')).json();
    if (j && j.success && typeof j.latitude === 'number') return [j.latitude, j.longitude];
  } catch (_) { /* rate-limited / offline */ }
  return null;
}

// Device geolocation (precise, prompts). Returns [lat,lng] or null.
export function geolocate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      () => resolve(null), { enableHighAccuracy: true, timeout: 8000 });
  });
}

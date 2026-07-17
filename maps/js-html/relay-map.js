// relay-map.js — a reusable relay-tiled map with an editable-circle overlay.
//
// Renders Google map tiles proxied through the Lumen relay (no Google key in the browser — only
// your `lk_` platform key), plus circle editing, a layer switcher, place search, reverse-geocode,
// a loading indicator, and a 3-tier "locate me". See ../README.md for the full guide.
//
// Requires Leaflet (window.L) loaded before this module. Zero other dependencies.
//
//   import { createRelayMap } from './relay-map.js';
//   const rm = createRelayMap(document.getElementById('map'), { lkKey: 'lk_xxx' });
//
// The load-bearing trick (see guide §3): browsers can't set an Authorization header on an <img>,
// so we fetch each tile WITH the Bearer header and hand Leaflet a blob URL.

const L = window.L;

// ── Bounds, copied verbatim from the reference implementation so places round-trip across clients.
export const MIN_R = 50, MAX_R = 1000, DEFAULT_R = 150, MAX_CIRCLES = 25;
const FALLBACK_CENTER = [32.0719, 34.7915];            // Tel Aviv — last-resort center (guide §5)
const clampRadius = (r) => Math.max(MIN_R, Math.min(MAX_R, Math.round(r)));

// ── geometry: destination point given distance (m) + bearing (deg). Used to place the east edge
//    resize handle at exactly `radiusM` from the center.
function destPoint(lat, lng, distM, bearingDeg) {
  const R = 6378137, br = bearingDeg * Math.PI / 180;
  const la = lat * Math.PI / 180, lo = lng * Math.PI / 180, d = distM / R;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
  const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la),
                              Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return L.latLng(la2 * 180 / Math.PI, ((lo2 * 180 / Math.PI) + 540) % 360 - 180);
}
const dot = (color) => L.divIcon({ className: '', iconSize: [16, 16],
  html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};` +
        `border:2px solid #fff;box-shadow:0 0 2px #0008"></div>` });

// ── Unit 1: authenticated tile layer (fetch + object URL + in-flight counter). ────────────────
// `getMapType()` is read fresh on every tile so a layer switch just needs redraw(). `onInFlight`
// is called with the running count so a spinner can show while tiles load.
function makeAuthTiles({ base, getKey, getMapType, onInFlight }) {
  let inFlight = 0;
  const bump = (d) => { inFlight += d; onInFlight && onInFlight(inFlight); };
  const Layer = L.GridLayer.extend({
    createTile(coords, done) {
      const img = document.createElement('img');
      const url = `${base}/google-map/tiles/${coords.z}/${coords.x}/${coords.y}?mapType=${getMapType()}`;
      bump(+1);
      fetch(url, { headers: { Authorization: `Bearer ${getKey()}` } })
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
        .then((blob) => {
          const obj = URL.createObjectURL(blob);
          img.onload = () => URL.revokeObjectURL(obj);
          img.src = obj;
          done(null, img);
        })
        .catch((err) => done(err, img))       // 401/402 → blank tile; the map stays usable
        .finally(() => bump(-1));
      return img;
    },
  });
  return new Layer({ minZoom: 2, maxZoom: 19 });
}

// ── Unit 6/8: relay JSON calls (search + reverse-geocode). Bearer auth; never log q/coords. ────
async function placesSearch(base, key, q, near, lang) {
  const p = new URLSearchParams({ q });
  if (near) p.set('near', `${near[0]},${near[1]}`);
  if (lang) p.set('lang', lang);
  const r = await fetch(`${base}/google-map/places/search?${p}`, {
    headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error('HTTP ' + r.status);   // 402 = out of credit
  return (await r.json()).candidates || [];
}
async function reverseGeocode(base, key, lat, lng, lang) {
  const p = new URLSearchParams({ latlng: `${lat},${lng}` });
  if (lang) p.set('lang', lang);
  const r = await fetch(`${base}/google-map/geocode?${p}`, {
    headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json()).results?.[0]?.address || null;
}

// ── Unit 7: location. IP first (no permission), device GPS on explicit call only. ─────────────
async function ipLocate() {
  try {
    const j = await (await fetch('https://ipwho.is/')).json();
    if (j && j.success && typeof j.latitude === 'number') return [j.latitude, j.longitude];
  } catch (_) { /* rate-limited / offline → caller keeps its fallback */ }
  return null;
}
function geolocate() {                                 // precise; prompts the user
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      () => resolve(null), { enableHighAccuracy: true, timeout: 8000 });
  });
}

// ── Public factory ────────────────────────────────────────────────────────────────────────────
export function createRelayMap(el, opts = {}) {
  const {
    lkKey, base = 'https://api.lumencredits.com',
    center = FALLBACK_CENTER, zoom = 14, mapType: initialType = 'roadmap',
    lang, onLoadingChange, onSelect, ipSeedOnLoad = true,
  } = opts;
  let key = lkKey, mapType = initialType;

  const map = L.map(el, { zoomControl: true }).setView(center, zoom);
  const tiles = makeAuthTiles({
    base, getKey: () => key, getMapType: () => mapType,
    onInFlight: (n) => onLoadingChange && onLoadingChange(n),
  }).addTo(map);

  // ── Unit 2/3: circle store + overlay + edit handles. ──
  const circles = [];        // { circle, center(marker), edge(marker|null), radiusM, address }
  let selected = null;

  function emitSelect() { onSelect && onSelect(selected == null ? null : circles[selected]); }

  function addCircle(lat, lng, radiusM = DEFAULT_R) {
    if (circles.length >= MAX_CIRCLES) return null;
    radiusM = clampRadius(radiusM);
    const circle = L.circle([lat, lng], { radius: radiusM, color: '#c8663a', weight: 2, fillOpacity: 0.12 }).addTo(map);
    const centerM = L.marker([lat, lng], { draggable: true, icon: dot('#c8663a') }).addTo(map);
    const item = { circle, center: centerM, edge: null, radiusM, address: null };
    const idx = () => circles.indexOf(item);
    circle.on('click', () => select(idx()));
    centerM.on('click', () => select(idx()));
    centerM.on('drag', () => {                          // MOVE
      const p = centerM.getLatLng();
      circle.setLatLng(p);
      item.address = null;
      if (item.edge) item.edge.setLatLng(destPoint(p.lat, p.lng, item.radiusM, 90));
    });
    centerM.on('dragend', () => { if (idx() === selected) labelSelected(); });
    circles.push(item);
    select(circles.length - 1);
    return item;
  }

  function select(i) {
    selected = i;
    circles.forEach((it, k) => {
      it.circle.setStyle({ weight: k === i ? 4 : 2, fillOpacity: k === i ? 0.22 : 0.12 });
      if (k === i && !it.edge) {                        // attach the resize handle to the selected circle
        const c = it.circle.getLatLng();
        it.edge = L.marker(destPoint(c.lat, c.lng, it.radiusM, 90), { draggable: true, icon: dot('#fff') }).addTo(map);
        it.edge.on('drag', () => {                      // RESIZE: radius = distance(center, handle)
          it.radiusM = clampRadius(map.distance(it.circle.getLatLng(), it.edge.getLatLng()));
          it.circle.setRadius(it.radiusM);
        });
      } else if (k !== i && it.edge) {                  // drop the handle from deselected circles
        map.removeLayer(it.edge); it.edge = null;
      }
    });
    emitSelect();
    labelSelected();
  }

  // Unit 8: reverse-geocode the selected circle's center → address label (one call on select/move).
  async function labelSelected() {
    if (selected == null || !key) return;
    const it = circles[selected];
    if (it.address) return;
    try {
      const c = it.circle.getLatLng();
      it.address = await reverseGeocode(base, key, c.lat, c.lng, lang);
      if (circles[selected] === it) emitSelect();
    } catch (_) { /* keep the map usable on 402/401 */ }
  }

  function deleteSelected() {
    if (selected == null) return;
    const it = circles[selected];
    [it.circle, it.center, it.edge].forEach((l) => l && map.removeLayer(l));
    circles.splice(selected, 1);
    selected = null;
    emitSelect();
  }

  map.on('click', (e) => addCircle(e.latlng.lat, e.latlng.lng));

  // ── Unit 4: layer switch (must re-request tiles, not restyle). ──
  function setMapType(t) { mapType = t; tiles.redraw(); }

  // ── Unit 6: search near the current map center. ──
  async function search(q) {
    if (!q || !key) return [];
    const c = map.getCenter();
    return placesSearch(base, key, q, [c.lat, c.lng], lang);
  }
  // Drop a circle at a chosen candidate + recenter.
  function addFromCandidate(cand) {
    const it = addCircle(cand.lat, cand.lng, cand.suggested_radius_m || DEFAULT_R);
    map.setView([cand.lat, cand.lng], Math.max(map.getZoom(), 16));
    return it;
  }

  // ── Unit 7: locate. Device GPS on demand; IP seed on load (opt-in via ipSeedOnLoad). ──
  async function locate() {
    const p = await geolocate();
    if (p) map.setView(p, Math.max(map.getZoom(), 15));
    return p;
  }
  if (ipSeedOnLoad) {
    ipLocate().then((p) => { if (p) map.setView(p, zoom); });  // silent; keeps `center` if it fails
  }

  // ── Unit 9: opt-in debounced typeahead (default off — each call bills a Text Search; guide §2.4).
  // Returns a detach fn. `input` is an <input>; `onResults(candidates)` renders them.
  function attachTypeahead(input, onResults, { delayMs = 350 } = {}) {
    let t = null;
    const handler = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = input.value.trim();
        if (q.length < 3) return onResults([]);
        try { onResults(await search(q)); } catch (_) { onResults([]); }
      }, delayMs);
    };
    input.addEventListener('input', handler);
    return () => { clearTimeout(t); input.removeEventListener('input', handler); };
  }

  return {
    map, tiles,
    setKey: (k) => { key = k; },
    setMapType, search, addFromCandidate, addCircle, deleteSelected, locate, attachTypeahead,
    getCircles: () => circles.map((c) => ({ lat: c.circle.getLatLng().lat, lng: c.circle.getLatLng().lng, radiusM: c.radiusM })),
    getSelected: () => (selected == null ? null : circles[selected]),
    destroy: () => map.remove(),
  };
}

export { placesSearch, reverseGeocode, ipLocate, geolocate };

// RelayMap.jsx — a relay-tiled map with editable circles, search, reverse-geocode and locate.
//
//   <RelayMap lkKey="lk_xxx" />
//
// Composes react-leaflet primitives with the RelayTileLayer (header-auth tiles) and the pure
// helpers in relay-api.js. See ../README.md for the shared component anatomy.
//
// Peer deps: react, leaflet, react-leaflet, @react-leaflet/core.

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { MapContainer, Circle, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { RelayTileLayer } from './RelayTileLayer.jsx';
import {
  DEFAULT_BASE, DEFAULT_R, MAX_CIRCLES, FALLBACK_CENTER,
  clampRadius, destPoint, distanceM, placesSearch, reverseGeocode, ipLocate, geolocate,
} from './relay-api.js';

const dot = (color) => L.divIcon({ className: '', iconSize: [16, 16],
  html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};` +
        `border:2px solid #fff;box-shadow:0 0 2px #0008"></div>` });
const CENTER_ICON = dot('#c8663a'), EDGE_ICON = dot('#fff');

// Adds a circle at every map click; also exposes the map to the parent via onReady.
function MapWiring({ onAddAt, onReady }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  useMapEvents({ click: (e) => onAddAt(e.latlng.lat, e.latlng.lng) });
  return null;
}

export function RelayMap({
  lkKey, base = DEFAULT_BASE, center = FALLBACK_CENTER, zoom = 14,
  defaultMapType = 'roadmap', lang, ipSeedOnLoad = true, typeahead = false, style,
}) {
  const [map, setMap] = useState(null);
  const [mapType, setMapType] = useState(defaultMapType);
  const [circles, setCircles] = useState([]);   // [{ lat, lng, radiusM, address }]
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(0);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);

  const near = useCallback(() => {
    const c = map ? map.getCenter() : { lat: center[0], lng: center[1] };
    return [c.lat, c.lng];
  }, [map, center]);

  // Unit 2/3: circle store + edits (all clamped here).
  const addCircle = useCallback((lat, lng, radiusM = DEFAULT_R) => {
    setCircles((cs) => {
      if (cs.length >= MAX_CIRCLES) return cs;
      setSelected(cs.length);                      // select the newly added last item
      return [...cs, { lat, lng, radiusM: clampRadius(radiusM), address: null }];
    });
  }, []);

  const moveCircle = useCallback((i, lat, lng) => setCircles((cs) =>
    cs.map((c, k) => (k === i ? { ...c, lat, lng, address: null } : c))), []);
  const resizeCircle = useCallback((i, handleLatLng) => setCircles((cs) =>
    cs.map((c, k) => (k === i
      ? { ...c, radiusM: clampRadius(distanceM([c.lat, c.lng], handleLatLng)) } : c))), []);
  const deleteSelected = useCallback(() => {
    if (selected == null) return;
    setCircles((cs) => cs.filter((_, k) => k !== selected));
    setSelected(null);
  }, [selected]);

  // Unit 8: reverse-geocode the selected circle → address label (one call on select/move).
  useEffect(() => {
    if (selected == null || !lkKey) return;
    const c = circles[selected];
    if (!c || c.address) return;
    let live = true;
    reverseGeocode(base, lkKey, c.lat, c.lng, lang)
      .then((addr) => { if (live) setCircles((cs) => cs.map((x, k) => (k === selected ? { ...x, address: addr } : x))); })
      .catch(() => {});
    return () => { live = false; };
  }, [selected, circles, base, lkKey, lang]);

  // Unit 7: IP seed on load.
  useEffect(() => {
    if (!ipSeedOnLoad || !map) return;
    ipLocate().then((p) => { if (p) map.setView(p, zoom); });
  }, [map, ipSeedOnLoad, zoom]);

  const doSearch = useCallback(async (query) => {
    const text = (query ?? q).trim();
    if (!text || !lkKey) return;
    try { setResults(await placesSearch(base, lkKey, text, near(), lang)); }
    catch (_) { setResults([]); }
  }, [q, lkKey, base, near, lang]);

  // Unit 9: opt-in debounced typeahead (default off — each call bills a Text Search; guide §2.4).
  const typeaheadTimer = React.useRef(null);
  const onQChange = useCallback((v) => {
    setQ(v);
    if (!typeahead) return;
    clearTimeout(typeaheadTimer.current);
    typeaheadTimer.current = setTimeout(() => { if (v.trim().length >= 3) doSearch(v); }, 350);
  }, [typeahead, doSearch]);

  const pick = useCallback((cand) => {
    addCircle(cand.lat, cand.lng, cand.suggested_radius_m || DEFAULT_R);
    if (map) map.setView([cand.lat, cand.lng], Math.max(map.getZoom(), 16));
    setResults([]);
  }, [addCircle, map]);

  const locate = useCallback(async () => {
    const p = await geolocate();
    if (p && map) map.setView(p, Math.max(map.getZoom(), 15));
  }, [map]);

  const selAddr = selected != null ? circles[selected]?.address : null;

  return (
    <div style={{ position: 'relative', height: '100%', ...style }}>
      <div style={barStyle}>
        <select value={mapType} onChange={(e) => setMapType(e.target.value)}>
          <option value="roadmap">Roadmap</option><option value="satellite">Satellite</option>
          <option value="terrain">Terrain</option><option value="hybrid">Hybrid</option>
        </select>
        <input value={q} placeholder="Search place / address"
               onChange={(e) => onQChange(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }} />
        <button onClick={doSearch}>Search</button>
        <button onClick={locate}>📍</button>
        <button onClick={deleteSelected} disabled={selected == null}>Delete</button>
      </div>

      <MapContainer center={center} zoom={zoom} style={{ height: '100%' }}>
        <MapWiring onAddAt={addCircle} onReady={setMap} />
        <RelayTileLayer lkKey={lkKey} base={base} mapType={mapType} onLoadingChange={setLoading} />
        {circles.map((c, i) => (
          <React.Fragment key={i}>
            <Circle center={[c.lat, c.lng]} radius={c.radiusM}
                    pathOptions={{ color: '#c8663a', weight: i === selected ? 4 : 2,
                                   fillOpacity: i === selected ? 0.22 : 0.12 }}
                    eventHandlers={{ click: () => setSelected(i) }} />
            <Marker position={[c.lat, c.lng]} icon={CENTER_ICON} draggable
                    eventHandlers={{
                      click: () => setSelected(i),
                      drag: (e) => { const p = e.target.getLatLng(); moveCircle(i, p.lat, p.lng); },
                    }} />
            {i === selected && (
              <Marker icon={EDGE_ICON} draggable
                      position={destPoint(c.lat, c.lng, c.radiusM, 90)}
                      eventHandlers={{ drag: (e) => { const p = e.target.getLatLng(); resizeCircle(i, [p.lat, p.lng]); } }} />
            )}
          </React.Fragment>
        ))}
      </MapContainer>

      {results.length > 0 && (
        <div style={resultsStyle}>
          {results.slice(0, 20).map((p, i) => (
            <div key={i} style={resultRow} onClick={() => pick(p)}>
              {p.name || p.address}<small style={{ color: '#666', display: 'block' }}>{p.address}</small>
            </div>
          ))}
        </div>
      )}
      {loading > 0 && <div style={{ ...pill, bottom: 12, left: '50%', transform: 'translateX(-50%)' }}>Loading map…</div>}
      {selAddr && <div style={{ ...pill, bottom: 12, left: 12, maxWidth: '60%' }}>{selAddr}</div>}
      <div style={{ ...pill, bottom: 12, right: 12, background: '#fff9', fontSize: 11 }}>©Google</div>
    </div>
  );
}

const barStyle = { position: 'absolute', zIndex: 500, top: 8, left: 8, display: 'flex', gap: 6,
  background: '#14161a', padding: 6, borderRadius: 8 };
const resultsStyle = { position: 'absolute', zIndex: 500, top: 56, left: 8, right: 8, maxHeight: '40%',
  overflow: 'auto', background: '#fff', borderRadius: 10, boxShadow: '0 2px 8px #0005' };
const resultRow = { padding: '8px 10px', borderBottom: '1px solid #eee', cursor: 'pointer', fontSize: 13 };
const pill = { position: 'absolute', zIndex: 500, background: '#fff', borderRadius: 20,
  padding: '6px 12px', boxShadow: '0 2px 8px #0005', fontSize: 12 };

export default RelayMap;

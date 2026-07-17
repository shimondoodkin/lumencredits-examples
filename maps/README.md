# Relay-Tiled Map Component — Guide

A map component that renders **Google map tiles through the Lumen relay** (no Google key in the
client — it authenticates only with an `lk_` platform key) and overlays **editable circles**
(add / delete / move / resize), a **layer-type switcher** (roadmap / satellite / terrain / hybrid),
a **tile-loading indicator**, **place search**, **reverse-geocode**, and a **"locate me"** control.

This is the shared guide behind the three ports — **[Vanilla JS](js-html/)**, **[React](react/)**,
**[Flutter](flutter/)**. All values below (endpoints, error envelopes, radius bounds) are copied
from the reference implementation so every port behaves identically.

---

## 1. What the component is

A full-screen (or embeddable) map that lets a user define a **place** = 1..25 **circles** (a lat/lng
center + a radius in metres). It is used for geofencing, but the map + circle-editor is generic and
reusable. Everything is built on the relay API — **nothing Google-specific ships in the client.**
The relay holds the Google key, meters usage per user, and returns plain tile images + JSON.

| Capability | How |
|---|---|
| Map tiles | `GET /google-map/tiles/{z}/{x}/{y}?mapType=…` |
| Layer types | `mapType` query: `roadmap`, `satellite`, `terrain`, `hybrid` |
| Place / address search | `GET /google-map/places/search?q=…` |
| Reverse geocode | `GET /google-map/geocode?latlng=<lat>,<lng>` |
| Loading indicator | count in-flight tile fetches; spinner while > 0 |
| Circle editing | client-side overlay: add at click, tap-select, drag to move, drag edge to resize |
| Locate ("what's near me") | IP geolocation on load + opt-in device GPS (§5) |

---

## 2. The HTTP API

Base URL: **`https://api.lumencredits.com`**
Auth (every request): **`Authorization: Bearer <lk_ key>`** — the caller's platform key.
Error envelope: `{"error":{"message":"…","status":"…"}}`. `402` = out of credit,
`401` = missing/invalid key, `400` = bad params.

### 2.1 Tiles — `GET /google-map/tiles/{z}/{x}/{y}`

Standard XYZ / Web-Mercator (EPSG:3857) 256 px tile scheme — same as OpenStreetMap/Leaflet.

| Param | |
|---|---|
| `z` / `x` / `y` | tile coordinates (path) |
| `mapType` | query, optional. `roadmap` (default) · `satellite` · `terrain` · `hybrid`. Unknown → **400** |

**Response:** the tile **image** bytes (`image/png` or jpeg) with cache headers.

**Metering:** the relay caches tiles server-side (LRU, ~2-week TTL). **Cache hits are free**; a
**miss** bills ~`$0.0006`/tile (`$0.60`/1000). A normal map open sits inside the monthly free tier.
You manage none of this client-side — just send the request.

```
GET /google-map/tiles/12/2048/1360?mapType=satellite
Authorization: Bearer lk_xxx
→ 200  image/png  (the tile)
```

### 2.2 Place / address search — `GET /google-map/places/search`

| Param | |
|---|---|
| `q` | query text (required) |
| `near` | `"<lat>,<lng>"` (optional) — **bias** results near a point (use the map center; see §5) |
| `lang` | ISO language code (optional) |

```json
{ "candidates": [
  { "name": "…", "address": "…", "lat": 32.07, "lng": 34.79, "suggested_radius_m": 150 }
] }
```

`suggested_radius_m` is server-clamped (80..500, default 150) — a good default circle radius.
≤ 20 candidates. Text Search handles both place names ("cafe uno") and addresses. `near` is a
**bias, not a restriction** — results outside the area still appear.

> **Privacy:** the query is user data — never log the query, the URL, or the `lk_` key.

### 2.3 Geocode — `GET /google-map/geocode`

Forward (`?address=<text>`) or reverse (`?latlng=<lat>,<lng>`), optional `&lang=`.

```json
{ "results": [ { "address": "12 Rothschild Blvd, Tel Aviv", "lat": 32.07, "lng": 34.77 } ] }
```

The component uses **reverse** geocode to label a selected circle ("you dropped this at …"). Forward
geocode is available too, but `places/search` already covers "search an address", so the components
don't add a separate forward-geocode box.

### 2.4 Autocomplete — not available

There is **no** autocomplete endpoint on the relay. The only way to get as-you-type suggestions is
to **debounce `places/search`** — but every debounced call bills a full Text Search (real Google
Autocomplete is session-priced and far cheaper). The JS/React components include a debounced
typeahead that is **OFF by default**; turn it on only knowing each keystroke-batch costs a search.

---

## 3. The web auth gotcha (read before building for the browser)

Native map SDKs (Flutter `flutter_map`, Android, iOS) can attach an `Authorization` header to each
tile fetch. **The browser cannot** — Leaflet/OpenLayers/MapLibre load tiles as `<img src=…>`, and
you cannot set headers on an `<img>` request. So the `Bearer` header pattern does **not** work for a
default web tile layer.

The fix (used by the JS + React ports): a **custom tile layer that `fetch()`es each tile with the
header, then hands the map an object URL** (`L.GridLayer.createTile` override). No server change, and
it gives you the in-flight loading count for free (increment on fetch start, decrement on settle).
**Never** put the `lk_` key in a plain tile URL — it would leak into logs / history.

---

## 4. Component anatomy (shared across all three)

Build these as independent units with one job each:

1. **Auth tile layer** — `(z,x,y,mapType)` + `lk_` → tile image. Web: fetch+blob; native:
   header-aware provider. Emits load-start / load-end so #5 can count.
2. **Circle model + store** — an array of `{lat, lng, radiusM}`, a `selected` index, and bounds
   constants. All edits clamp here: radius `[50, 1000]` m, ≤ `25` circles, default `150` m.
3. **Circle overlay + edit handles** — draws circles; a **center handle** drags → move, an **edge
   handle** on the selected circle drags → resize (`radius = distance(center, handle)`), map click →
   add at click or select. Keep handles as real draggable markers so they don't fight the map's pan
   gesture (a hard-won lesson — a custom pan-recognizer overlay *lost the gesture arena* to the map
   on touch devices).
4. **Layer switcher** — sets `mapType` and **reloads** the tile layer (redraw / swap options — must
   re-request, not just restyle).
5. **Loading indicator** — visible while in-flight tile count > 0. Decrement on settle/cancel.
6. **Search box** — `places/search?q=…&near=<map center>`, lists candidates, adds a circle at a
   chosen candidate using its `suggested_radius_m`.
7. **Locate** — the 3-tier location strategy (§5).
8. **Reverse-geocode on select** — on selecting a circle, `geocode?latlng=<center>` → show an
   address label.
9. **Debounced typeahead** — optional, default off (§2.4).

---

## 5. Location strategy — "what's near him"

The relay's `near` param only **biases** search; the client must supply the point. Three tiers, no
blocking prompt on load:

```
on load  → GET https://ipwho.is/   (keyless, HTTPS, CORS *, returns {latitude,longitude,city,success})
           → center the map + seed `near`
           └─ fails / success:false / rate-limited → hardcoded fallback center (Tel Aviv)
📍 button → device geolocation (web: navigator.geolocation; Flutter: geolocator), opt-in tap only
           → recenter + reseed `near`
every search → near = current map center   // whether IP-seeded, GPS-seeded, or user-panned
```

- `ipwho.is` free tier is monthly-rate-limited — fine for a demo/starter; swap for a keyed provider
  at scale.
- Device geolocation is **sensitive** — request it only on an explicit tap, never silently on load.
- Browser geolocation without GPS (desktop Wi-Fi/IP) is city-level coarse — fine for search bias,
  not for a precise pin.

---

## 6. Gotchas & best practices

- **Web tiles need fetch+blob** (§3). Don't ship the `lk_` key in a plain tile URL.
- **Handle 402/401 gracefully** — on out-of-credit / bad key, tiles & searches fail; keep the map
  usable (blank tiles, a small "map unavailable" note). Never surface the URL or key in an error.
- **Never log** the `lk_` key, the search query, or user coordinates.
- **Attribution** — Google tiles require visible attribution; show a static "©Google".
- **`mapType` reload** — changing the type must actually re-request tiles, not just restyle.
- **Radius/count bounds** — clamp radius to `[50, 1000]` m and cap at `25` circles, matching the
  reference so saved places round-trip across clients.
- **Prerequisite:** a valid `lk_` key. Obtaining it (device login) is shown live at
  `https://lumencredits.com/dashboard/example/map.html`.

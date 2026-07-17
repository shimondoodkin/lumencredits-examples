# Vanilla JS / HTML — Relay-Tiled Map

A dependency-free (besides [Leaflet](https://leafletjs.com)) reusable map module. See the
[maps guide](../README.md) for the API and design rationale.

## Files

| File | Responsibility |
|---|---|
| `relay-map.js` | The reusable component. `createRelayMap(el, opts)` — auth tile layer (fetch+blob), circle editor, search, reverse-geocode, locate. No deps but Leaflet. |
| `index.html` | Runnable demo wiring the module to a toolbar (key input, layer select, search, 📍, delete). |

## Run the demo

Serve the folder over HTTP (ES modules don't load from `file://`) and open `index.html`:

```bash
npx serve maps/js-html      # or: python3 -m http.server
```

Paste an `lk_` key (get one from the [live example](https://lumencredits.com/dashboard/example/map.html)).

## Use it in your app

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<div id="map" style="height:100vh"></div>
<script type="module">
  import { createRelayMap } from './relay-map.js';
  const rm = createRelayMap(document.getElementById('map'), {
    lkKey: 'lk_xxx',
    onLoadingChange: (n) => {/* n>0 → show spinner */},
    onSelect: (circle) => {/* circle.address after reverse-geocode */},
  });
  // rm.setMapType('satellite'); rm.search('coffee'); rm.locate(); rm.getCircles();
</script>
```

### API — `createRelayMap(el, opts)`

**opts:** `lkKey`, `base` (default `https://api.lumencredits.com`), `center` `[lat,lng]`, `zoom`,
`mapType`, `lang`, `ipSeedOnLoad` (default `true`), `onLoadingChange(n)`, `onSelect(circle|null)`.

**returns:** `{ map, setKey(k), setMapType(t), search(q)→candidates, addFromCandidate(c),
addCircle(lat,lng,r?), deleteSelected(), locate()→[lat,lng]|null, attachTypeahead(input, onResults),
getCircles()→[{lat,lng,radiusM}], getSelected(), destroy() }`.

Constants exported: `MIN_R=50`, `MAX_R=1000`, `DEFAULT_R=150`, `MAX_CIRCLES=25`.

> **Typeahead** (`attachTypeahead`) is opt-in — each debounced call bills a full Text Search. There
> is no cheap autocomplete endpoint (guide §2.4). Prefer press-Enter search.

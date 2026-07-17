# React — Relay-Tiled Map

A [react-leaflet](https://react-leaflet.js.org) map component. See the [maps guide](../README.md)
for the API and design rationale.

## Files

| File | Responsibility |
|---|---|
| `RelayTileLayer.jsx` | Header-authenticated tile layer (fetch+blob) bridged into react-leaflet via `@react-leaflet/core`. |
| `RelayMap.jsx` | The full component — tiles + circles + layer switch + search + reverse-geocode + 📍 locate + spinner. |
| `relay-api.js` | Framework-agnostic relay calls + geometry + bounds (no React/Leaflet). |
| `demo.html` | Build-free runnable demo (compiles the real `.jsx` in-browser; deps via esm.sh). |

## Run the demo

Serve the folder over HTTP and open `demo.html`, then paste an `lk_` key:

```bash
npx serve maps/react      # or: python3 -m http.server
```

The demo needs no bundler — it Babel-compiles `RelayMap.jsx` / `RelayTileLayer.jsx` at runtime and
loads `react`, `react-leaflet`, `leaflet` from a CDN.

## Use it in your app (with a bundler)

```bash
npm i react-leaflet leaflet @react-leaflet/core
```

```jsx
import 'leaflet/dist/leaflet.css';
import { RelayMap } from './RelayMap.jsx';

export default function App() {
  return <div style={{ height: '100vh' }}><RelayMap lkKey="lk_xxx" /></div>;
}
```

### `<RelayMap>` props

`lkKey` (required), `base` (default `https://api.lumencredits.com`), `center` `[lat,lng]`, `zoom`,
`defaultMapType` (`roadmap|satellite|terrain|hybrid`), `lang`, `ipSeedOnLoad` (default `true`),
`style`.

Bounds live in `relay-api.js`: `MIN_R=50`, `MAX_R=1000`, `DEFAULT_R=150`, `MAX_CIRCLES=25`.

> No autocomplete endpoint exists (guide §2.4); search is press-Enter. Reverse-geocode runs once per
> circle selection to label its center.

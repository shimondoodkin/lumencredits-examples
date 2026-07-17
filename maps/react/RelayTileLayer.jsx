// RelayTileLayer.jsx — a header-authenticated tile layer for react-leaflet.
//
// react-leaflet has no built-in header-aware tile layer, and the browser can't set an
// Authorization header on the <img> that a normal TileLayer emits (guide §3). So we bridge a
// Leaflet GridLayer whose createTile() fetches each tile WITH the Bearer header and hands back a
// blob URL, then wrap it as a react-leaflet component via createLayerComponent.
//
// Props: { lkKey, base='https://api.lumencredits.com', mapType='roadmap', onLoadingChange? }
//   onLoadingChange(n) fires with the in-flight tile count so a parent can drive a spinner.
//
// Requires: leaflet, react-leaflet, @react-leaflet/core (peer deps of your app).

import L from 'leaflet';
import { createLayerComponent, updateGridLayer } from '@react-leaflet/core';

const AuthGridLayer = L.GridLayer.extend({
  initialize(options) {
    L.setOptions(this, options);
    this._inFlight = 0;
  },
  _bump(d) {
    this._inFlight += d;
    if (this.options.onLoadingChange) this.options.onLoadingChange(this._inFlight);
  },
  createTile(coords, done) {
    const img = document.createElement('img');
    const { base, lkKey, mapType } = this.options;
    const url = `${base}/google-map/tiles/${coords.z}/${coords.x}/${coords.y}?mapType=${mapType}`;
    this._bump(+1);
    fetch(url, { headers: { Authorization: `Bearer ${lkKey}` } })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then((blob) => {
        const obj = URL.createObjectURL(blob);
        img.onload = () => URL.revokeObjectURL(obj);
        img.src = obj;
        done(null, img);
      })
      .catch((err) => done(err, img))          // 401/402 → blank tile; map stays usable
      .finally(() => this._bump(-1));
    return img;
  },
});

function toOptions(props) {
  return {
    base: props.base || 'https://api.lumencredits.com',
    lkKey: props.lkKey,
    mapType: props.mapType || 'roadmap',
    onLoadingChange: props.onLoadingChange,
    minZoom: props.minZoom ?? 2,
    maxZoom: props.maxZoom ?? 19,
  };
}

export const RelayTileLayer = createLayerComponent(
  function createRelayTileLayer(props, context) {
    const instance = new AuthGridLayer(toOptions(props));
    return { instance, context };
  },
  function updateRelayTileLayer(instance, props, prevProps) {
    updateGridLayer(instance, props, prevProps);
    // A mapType (or key) change must actually re-request tiles, not restyle (guide §6).
    if (props.mapType !== prevProps.mapType || props.lkKey !== prevProps.lkKey) {
      instance.options.mapType = props.mapType || 'roadmap';
      instance.options.lkKey = props.lkKey;
      instance.redraw();
    }
  },
);

export default RelayTileLayer;

# Lumen Credits — Examples

Copy-paste starter kits for building on the [Lumen Credits](https://lumencredits.com) platform API.

You bring a platform key (`lk_…`); the relay holds every provider key, meters usage per user, and
returns plain results. Nothing provider-specific ships in your client.

## Maps

A reusable **relay-tiled map** component — Google map tiles streamed through the relay (no Google
key in your client), plus an editable-circle overlay, a layer-type switcher, place search,
reverse-geocode, and a "locate me" control. Built the same way in three stacks:

| Stack | Folder | Runnable demo |
|---|---|---|
| Vanilla JS / HTML (Leaflet) | [`maps/js-html/`](maps/js-html/) | `index.html` |
| React (react-leaflet) | [`maps/react/`](maps/react/) | `demo.html` |
| Flutter (`flutter_map`) | [`maps/flutter/`](maps/flutter/) | `example/main.dart` |

Start with the **[maps guide](maps/README.md)** — it documents the HTTP API, the browser
auth gotcha, the location strategy, and the shared component anatomy that every port follows.

### Live, self-serve example

A single page that logs you in (device flow → `lk_` key) and then runs an annotated vanilla-JS map
against the live API — read it top to bottom to see every call:

**<https://lumencredits.com/dashboard/example/map.html?app=YOUR_APP_SLUG>**

## Getting a key

Every example needs an `lk_…` platform key for one of your apps. The live example above obtains one
for you via the device-login flow. In your own app you get it the same way — see the
[app-login docs](https://lumencredits.com/docs#app-login).

## License

MIT — use these as a starting point for your own app.

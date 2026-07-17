# Flutter — Relay-Tiled Map

A [`flutter_map`](https://pub.dev/packages/flutter_map) component. This is the reference stack the
guide is modelled on. See the [maps guide](../README.md) for the API and design rationale.

## Files

| File | Responsibility |
|---|---|
| `lib/relay_tile_source.dart` | The tile API seam: URL template per `mapType`, the Bearer header, and a tile provider that counts in-flight tiles for the loading indicator. |
| `lib/place.dart` | `PlaceCircle` + the bounds constants (`kMinRadiusM=50`, `kMaxRadiusM=1000`, `kDefaultRadiusM=150`, `kMaxCirclesPerPlace=25`). |
| `lib/places_search_client.dart` | `PlacesSearchClient` (search + reverse-geocode) + `ipLocate()` / `deviceLocate()`. |
| `lib/relay_map.dart` | The `RelayMap` widget: tiles + circles + drag handles + layer switch + search + locate + loading pill. |
| `example/main.dart` | Minimal host app. |

## Use it

Copy the four `lib/` files into your app and add these dependencies to your `pubspec.yaml`:

```yaml
dependencies:
  flutter_map: ^6.1.0
  flutter_map_dragmarker: ^6.1.0
  latlong2: ^0.9.0
  geolocator: ^11.0.0
  http: ^1.1.0
```

Then drop the widget in:

```dart
import 'relay_map.dart';

Scaffold(body: RelayMap(lkKey: 'lk_xxx'));   // lk_ from your device-login flow
```

### `RelayMap` parameters

`lkKey` (required), `base` (default `https://api.lumencredits.com`), `center` (`LatLng`), `zoom`,
`defaultMapType` (`roadmap|satellite|terrain|hybrid`), `lang`, `ipSeedOnLoad` (default `true`).

### Platform permissions (for 📍 device locate)

`geolocator` needs the location permission declared:

- **Android** — `android/app/src/main/AndroidManifest.xml`:
  `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />`
- **iOS** — `ios/Runner/Info.plist`:
  `NSLocationWhenInUseUsageDescription` = "Used to center the map on your location."

Location is requested only when the user taps 📍 (guide §5). IP-based centering (`ipwho.is`) needs no
permission and runs on load.

> Targets `flutter_map` ^6 / `flutter_map_dragmarker` ^6. On the web build, tiles go through
> `NetworkImage` with headers — the browser `<img>` gotcha (guide §3) applies only to the JS/Leaflet
> port, not to Flutter web's `flutter_map`.

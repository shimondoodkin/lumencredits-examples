// relay_tile_source.dart — the API seam for tiles.
//
// Native map SDKs (unlike the browser) CAN attach an Authorization header to each tile fetch, so
// here the header pattern works directly — no fetch+blob dance. This file is the whole "how to
// talk to the tile API": a URL template per mapType + the Bearer header + a tile provider that
// counts in-flight requests so the widget can show a loading indicator.

import 'package:flutter/widgets.dart';
import 'package:flutter_map/flutter_map.dart';

const String kRelayBase = 'https://api.lumencredits.com';

/// Tile URL template for a given [mapType]. flutter_map fills in `{z}/{x}/{y}`; the mapType is
/// baked into the string so switching layers = a new template (re-requests tiles, guide §6).
String relayTileUrlTemplate(String mapType, {String base = kRelayBase}) =>
    '$base/google-map/tiles/{z}/{x}/{y}?mapType=$mapType';

/// The auth header carried on every tile request. Never log this.
Map<String, String> relayTileHeaders(String lkKey) => {'Authorization': 'Bearer $lkKey'};

/// A [TileProvider] that adds the Bearer header and counts in-flight tiles into [inFlight] so the
/// widget can show a spinner. Decrements on the image completing OR erroring, so fast panning
/// can't leak the count.
class CountingRelayTileProvider extends TileProvider {
  final String lkKey;
  final ValueNotifier<int> inFlight;

  CountingRelayTileProvider({required this.lkKey, required this.inFlight});

  @override
  ImageProvider getImage(TileCoordinates coordinates, TileLayer options) {
    final url = getTileUrl(coordinates, options);
    inFlight.value = inFlight.value + 1;
    final provider = NetworkImage(url, headers: relayTileHeaders(lkKey));
    var settled = false;
    void done() {
      if (settled) return;
      settled = true;
      final n = inFlight.value - 1;
      inFlight.value = n < 0 ? 0 : n;
    }

    provider.resolve(const ImageConfiguration()).addListener(
          ImageStreamListener((_, __) => done(), onError: (_, __) => done()),
        );
    return provider;
  }
}

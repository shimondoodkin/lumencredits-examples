// places_search_client.dart — the relay search + reverse-geocode API client, and location helpers.
//
// GET /google-map/places/search  -> { candidates: [...] }
// GET /google-map/geocode        -> { results: [...] }
// Plus IP geolocation (ipwho.is) and device GPS (geolocator) for the "locate" strategy (guide §5).

import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import 'relay_tile_source.dart' show kRelayBase, relayTileHeaders;

/// One search result. `suggestedRadiusM` is a good default circle radius (server-clamped 80..500).
class PlaceCandidate {
  final String name;
  final String address;
  final double lat;
  final double lng;
  final double suggestedRadiusM;
  PlaceCandidate(this.name, this.address, this.lat, this.lng, this.suggestedRadiusM);
}

class PlacesSearchClient {
  final String lkKey;
  final String base;
  PlacesSearchClient({required this.lkKey, this.base = kRelayBase});

  /// Text Search near [near] (bias, not restriction). Never log [q] or the URL.
  Future<List<PlaceCandidate>> search(String q, {LatLng? near, String? lang}) async {
    final params = <String, String>{'q': q};
    if (near != null) params['near'] = '${near.latitude},${near.longitude}';
    if (lang != null) params['lang'] = lang;
    final uri = Uri.parse('$base/google-map/places/search').replace(queryParameters: params);
    final r = await http.get(uri, headers: relayTileHeaders(lkKey));
    if (r.statusCode != 200) throw HttpException(r.statusCode); // 402 = out of credit
    final list = (jsonDecode(r.body)['candidates'] as List?) ?? const [];
    return list
        .map((c) => PlaceCandidate(
              (c['name'] ?? '') as String,
              (c['address'] ?? '') as String,
              (c['lat'] as num).toDouble(),
              (c['lng'] as num).toDouble(),
              ((c['suggested_radius_m'] ?? 150) as num).toDouble(),
            ))
        .toList();
  }

  /// Reverse-geocode a point to an address label (used when a circle is selected).
  Future<String?> reverseGeocode(LatLng at, {String? lang}) async {
    final params = <String, String>{'latlng': '${at.latitude},${at.longitude}'};
    if (lang != null) params['lang'] = lang;
    final uri = Uri.parse('$base/google-map/geocode').replace(queryParameters: params);
    final r = await http.get(uri, headers: relayTileHeaders(lkKey));
    if (r.statusCode != 200) throw HttpException(r.statusCode);
    final results = (jsonDecode(r.body)['results'] as List?) ?? const [];
    if (results.isEmpty) return null;
    return results.first['address'] as String?;
  }
}

class HttpException implements Exception {
  final int status;
  HttpException(this.status);
  @override
  String toString() => 'HttpException($status)';
}

/// IP geolocation — no permission, city-level. Returns null on failure (keep your fallback center).
Future<LatLng?> ipLocate() async {
  try {
    final r = await http.get(Uri.parse('https://ipwho.is/'));
    if (r.statusCode != 200) return null;
    final j = jsonDecode(r.body);
    if (j['success'] == true && j['latitude'] is num) {
      return LatLng((j['latitude'] as num).toDouble(), (j['longitude'] as num).toDouble());
    }
  } catch (_) {/* rate-limited / offline */}
  return null;
}

/// Device GPS — precise, prompts for permission. Call only on an explicit tap (guide §5).
Future<LatLng?> deviceLocate() async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) return null;
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return null;
    final pos = await Geolocator.getCurrentPosition();
    return LatLng(pos.latitude, pos.longitude);
  } catch (_) {
    return null;
  }
}

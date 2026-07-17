// place.dart — the circle data model + the bounds constants shared by every port.
//
// Values are copied verbatim from the reference implementation so a place defined on one client
// round-trips to another unchanged.

/// A single geofence circle: a lat/lng center + a radius in metres.
class PlaceCircle {
  double lat;
  double lng;
  double radiusM;
  String? address; // filled by reverse-geocode when the circle is selected

  PlaceCircle({required this.lat, required this.lng, required this.radiusM, this.address});

  PlaceCircle copyWith({double? lat, double? lng, double? radiusM, String? address}) => PlaceCircle(
        lat: lat ?? this.lat,
        lng: lng ?? this.lng,
        radiusM: radiusM ?? this.radiusM,
        address: address ?? this.address,
      );
}

// Radius / count bounds — clamp all edits to these (guide §4/§6).
const double kMinRadiusM = 50;
const double kMaxRadiusM = 1000;
const double kDefaultRadiusM = 150;
const int kMaxCirclesPerPlace = 25;

double clampRadius(double r) => r < kMinRadiusM ? kMinRadiusM : (r > kMaxRadiusM ? kMaxRadiusM : r);

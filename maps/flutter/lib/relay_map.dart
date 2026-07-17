// relay_map.dart — the relay-tiled map widget: tiles + editable circles + layer switch + search
// + reverse-geocode + locate + loading indicator. Targets flutter_map ^6 & flutter_map_dragmarker ^6.
//
//   RelayMap(lkKey: 'lk_xxx')
//
// See ../README.md for the shared component anatomy this mirrors.

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_map_dragmarker/flutter_map_dragmarker.dart';
import 'package:latlong2/latlong.dart';

import 'place.dart';
import 'relay_tile_source.dart';
import 'places_search_client.dart';

const LatLng kFallbackCenter = LatLng(32.0719, 34.7915); // Tel Aviv (guide §5)
const List<String> kMapTypes = ['roadmap', 'satellite', 'terrain', 'hybrid'];
const Distance _distance = Distance();

class RelayMap extends StatefulWidget {
  final String lkKey;
  final String base;
  final LatLng center;
  final double zoom;
  final String defaultMapType;
  final String? lang;
  final bool ipSeedOnLoad;

  const RelayMap({
    super.key,
    required this.lkKey,
    this.base = kRelayBase,
    this.center = kFallbackCenter,
    this.zoom = 14,
    this.defaultMapType = 'roadmap',
    this.lang,
    this.ipSeedOnLoad = true,
  });

  @override
  State<RelayMap> createState() => _RelayMapState();
}

class _RelayMapState extends State<RelayMap> {
  final MapController _map = MapController();
  final ValueNotifier<int> _inFlight = ValueNotifier<int>(0);
  late final PlacesSearchClient _client =
      PlacesSearchClient(lkKey: widget.lkKey, base: widget.base);

  final List<PlaceCircle> _circles = [];
  int? _selected;
  late String _mapType = widget.defaultMapType;
  final TextEditingController _q = TextEditingController();
  List<PlaceCandidate> _results = [];

  @override
  void initState() {
    super.initState();
    if (widget.ipSeedOnLoad) {
      ipLocate().then((p) { if (p != null && mounted) _map.move(p, widget.zoom); });
    }
  }

  @override
  void dispose() {
    _inFlight.dispose();
    _q.dispose();
    super.dispose();
  }

  LatLng get _center => _map.camera.center;

  // ── Unit 2/3: circle store + edits (all clamped here) ──────────────────────────────────────
  void _addCircle(double lat, double lng, [double radiusM = kDefaultRadiusM]) {
    if (_circles.length >= kMaxCirclesPerPlace) return;
    setState(() {
      _circles.add(PlaceCircle(lat: lat, lng: lng, radiusM: clampRadius(radiusM)));
      _selected = _circles.length - 1;
    });
    _labelSelected();
  }

  void _move(int i, LatLng p) {
    setState(() { _circles[i]..lat = p.latitude..lng = p.longitude..address = null; });
  }

  void _resize(int i, LatLng handle) {
    final c = _circles[i];
    final r = _distance.as(LengthUnit.Meter, LatLng(c.lat, c.lng), handle);
    setState(() => c.radiusM = clampRadius(r));
  }

  void _deleteSelected() {
    if (_selected == null) return;
    setState(() { _circles.removeAt(_selected!); _selected = null; });
  }

  // ── Unit 8: reverse-geocode the selected circle's center → address label ───────────────────
  Future<void> _labelSelected() async {
    final i = _selected;
    if (i == null) return;
    final c = _circles[i];
    if (c.address != null) return;
    try {
      final addr = await _client.reverseGeocode(LatLng(c.lat, c.lng), lang: widget.lang);
      if (mounted && _selected == i) setState(() => c.address = addr);
    } catch (_) {/* keep the map usable on 402/401 */}
  }

  // ── Unit 6: search near the current map center ─────────────────────────────────────────────
  Future<void> _search() async {
    final q = _q.text.trim();
    if (q.isEmpty) return;
    try {
      final r = await _client.search(q, near: _center, lang: widget.lang);
      setState(() => _results = r);
    } catch (_) {
      setState(() => _results = []);
    }
  }

  void _pick(PlaceCandidate c) {
    _addCircle(c.lat, c.lng, c.suggestedRadiusM);
    _map.move(LatLng(c.lat, c.lng), _map.camera.zoom < 16 ? 16 : _map.camera.zoom);
    setState(() => _results = []);
  }

  // ── Unit 7: device locate on tap ───────────────────────────────────────────────────────────
  Future<void> _locate() async {
    final p = await deviceLocate();
    if (p != null) _map.move(p, _map.camera.zoom < 15 ? 15 : _map.camera.zoom);
  }

  Widget _handle(Color color) => Container(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: const [BoxShadow(blurRadius: 2, color: Colors.black45)],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final selAddr = _selected != null ? _circles[_selected!].address : null;

    return Stack(children: [
      FlutterMap(
        mapController: _map,
        options: MapOptions(
          initialCenter: widget.center,
          initialZoom: widget.zoom,
          minZoom: 2,
          maxZoom: 19,
          onTap: (_, latlng) => _addCircle(latlng.latitude, latlng.longitude),
        ),
        children: [
          // Unit 1/4: header-auth tiles; a new mapType => a new urlTemplate (re-requests tiles).
          TileLayer(
            key: ValueKey(_mapType),
            urlTemplate: relayTileUrlTemplate(_mapType, base: widget.base),
            tileProvider: CountingRelayTileProvider(lkKey: widget.lkKey, inFlight: _inFlight),
            userAgentPackageName: 'com.lumencredits.example',
          ),
          CircleLayer(
            circles: [
              for (var i = 0; i < _circles.length; i++)
                CircleMarker(
                  point: LatLng(_circles[i].lat, _circles[i].lng),
                  radius: _circles[i].radiusM,
                  useRadiusInMeter: true,
                  color: const Color(0x1FC8663A),
                  borderColor: const Color(0xFFC8663A),
                  borderStrokeWidth: i == _selected ? 4 : 2,
                ),
            ],
          ),
          DragMarkers(markers: _dragMarkers()),
        ],
      ),

      // Toolbar
      Positioned(top: 8, left: 8, right: 8, child: _toolbar()),

      // Search results
      if (_results.isNotEmpty)
        Positioned(top: 56, left: 8, right: 8, child: _resultsList()),

      // Loading pill
      Positioned(
        bottom: 12,
        left: 0,
        right: 0,
        child: Center(
          child: ValueListenableBuilder<int>(
            valueListenable: _inFlight,
            builder: (_, n, __) => n > 0 ? _pill('Loading map…') : const SizedBox.shrink(),
          ),
        ),
      ),

      // Address label + attribution
      if (selAddr != null) Positioned(bottom: 12, left: 12, child: _pill(selAddr)),
      Positioned(bottom: 12, right: 12, child: _pill('©Google')),
    ]);
  }

  List<DragMarker> _dragMarkers() {
    final markers = <DragMarker>[];
    for (var i = 0; i < _circles.length; i++) {
      final c = _circles[i];
      // Center handle → move.
      markers.add(DragMarker(
        point: LatLng(c.lat, c.lng),
        size: const Size(18, 18),
        builder: (_, __, ___) => GestureDetector(
          onTap: () { setState(() => _selected = i); _labelSelected(); },
          child: _handle(const Color(0xFFC8663A)),
        ),
        onDragUpdate: (_, p) => _move(i, p),
        onDragEnd: (_, __) { setState(() => _selected = i); _labelSelected(); },
      ));
      // Edge handle → resize (only on the selected circle).
      if (i == _selected) {
        final edge = _distance.offset(LatLng(c.lat, c.lng), c.radiusM, 90);
        markers.add(DragMarker(
          point: edge,
          size: const Size(18, 18),
          builder: (_, __, ___) => _handle(Colors.white),
          onDragUpdate: (_, p) => _resize(i, p),
        ));
      }
    }
    return markers;
  }

  Widget _toolbar() => Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(color: const Color(0xFF14161A), borderRadius: BorderRadius.circular(8)),
        child: Row(children: [
          DropdownButton<String>(
            value: _mapType,
            dropdownColor: const Color(0xFF1F232A),
            style: const TextStyle(color: Colors.white),
            underline: const SizedBox.shrink(),
            items: [for (final t in kMapTypes) DropdownMenuItem(value: t, child: Text(t))],
            onChanged: (t) => setState(() => _mapType = t ?? 'roadmap'),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: TextField(
              controller: _q,
              onSubmitted: (_) => _search(),
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                  hintText: 'Search place / address', hintStyle: TextStyle(color: Colors.white54), isDense: true),
            ),
          ),
          IconButton(onPressed: _search, icon: const Icon(Icons.search, color: Colors.white)),
          IconButton(onPressed: _locate, icon: const Icon(Icons.my_location, color: Colors.white)),
          IconButton(
              onPressed: _selected == null ? null : _deleteSelected,
              icon: const Icon(Icons.delete_outline, color: Colors.white)),
        ]),
      );

  Widget _resultsList() => Material(
        elevation: 4,
        borderRadius: BorderRadius.circular(10),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 240),
          child: ListView(
            shrinkWrap: true,
            children: [
              for (final c in _results.take(20))
                ListTile(
                  dense: true,
                  title: Text(c.name.isNotEmpty ? c.name : c.address),
                  subtitle: c.address.isNotEmpty ? Text(c.address) : null,
                  onTap: () => _pick(c),
                ),
            ],
          ),
        ),
      );

  Widget _pill(String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), boxShadow: const [
          BoxShadow(blurRadius: 8, color: Colors.black26),
        ]),
        child: Text(text, style: const TextStyle(fontSize: 12)),
      );
}

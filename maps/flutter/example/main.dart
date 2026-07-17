// main.dart — minimal app that hosts the RelayMap. Paste your lk_ key below (or wire it in from
// your platform's device-login flow) and run.
//
// Copy the four files under ../lib/ into your app's lib/ and add the deps from ../README.md.

import 'package:flutter/material.dart';
import '../lib/relay_map.dart';

// In a real app this comes from your device-login flow, not a constant.
const String kLkKey = 'lk_xxx';

void main() => runApp(const _App());

class _App extends StatelessWidget {
  const _App();
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RelayMap example',
      home: Scaffold(
        body: kLkKey == 'lk_xxx'
            ? const Center(child: Text('Set kLkKey in example/main.dart'))
            : const RelayMap(lkKey: kLkKey),
      ),
    );
  }
}

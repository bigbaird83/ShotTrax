/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'watch',
  name: 'ShotTraxxWatch',
  displayName: 'ShotTraxx™',
  bundleIdentifier: `${config.ios.bundleIdentifier}.watch`,
  deploymentTarget: '10.0',
  icon: '../../assets/images/icon.png',
  colors: {
    $accent: '#C8F542',
    lime: '#C8F542',
    cream: '#F4F1E8',
    muted: '#8A9A8E',
    bg: '#0B1A12',
  },
  frameworks: ['WatchConnectivity', 'CoreLocation', 'WidgetKit', 'HealthKit'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.shottrax.app'],
    'com.apple.developer.healthkit': true,
  },
  infoPlist: {
    // `location` must ship with allowsBackgroundLocationUpdates. Setting that
    // property without this mode terminates the watch app.
    WKBackgroundModes: ['workout-processing', 'location'],
    NSLocationWhenInUseUsageDescription:
      'ShotTraxx™ uses your Apple Watch location during a round to show yards to the green as you walk, and when you pick a club to mark where you hit from.',
    NSHealthShareUsageDescription:
      'ShotTraxx™ does not read your Health data. It uses Health only to keep your round running on your Apple Watch.',
    NSHealthUpdateUsageDescription:
      'ShotTraxx™ uses a golf workout on your Apple Watch only to keep the round running. It does not save the round to Health.',
  },
});

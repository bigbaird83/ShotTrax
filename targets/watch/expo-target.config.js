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
  frameworks: ['WatchConnectivity', 'CoreLocation', 'WidgetKit', 'HealthKit', 'AVFoundation', 'AVKit'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.shottrax.app'],
    'com.apple.developer.healthkit': true,
  },
  infoPlist: {
    // UIBackgroundModes `location` must ship with allowsBackgroundLocationUpdates.
    // Core Location reads UIBackgroundModes, not WKBackgroundModes; setting the
    // property without it terminates the watch app. WKBackgroundModes only
    // takes session types such as workout-processing.
    // @bacons/apple-targets 5 does not read this object. Prebuild keeps
    // targets/watch/Info.plist (it only writes that file when missing, and the
    // watch template is empty) and Xcode compiles it as INFOPLIST_FILE.
    // plugins/withWatchInfoPlist.js copies these keys into that file so they
    // are in the built app.
    UIBackgroundModes: ['location'],
    WKBackgroundModes: ['workout-processing'],
    NSLocationWhenInUseUsageDescription:
      'ShotTraxx™ uses Watch location during a round to show yards to the green and mark where you hit from.',
    NSHealthShareUsageDescription:
      'ShotTraxx™ does not read your Health data. It uses Health only to keep your round running on your Apple Watch.',
    NSHealthUpdateUsageDescription:
      'ShotTraxx™ uses a golf workout on your Apple Watch only to keep the round running. It does not save the round to Health.',
  },
});

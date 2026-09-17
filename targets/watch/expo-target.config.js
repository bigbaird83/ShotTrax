/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'watch',
  name: 'ShotTraxxWatch',
  displayName: 'ShotTraxx',
  bundleIdentifier: `${config.ios.bundleIdentifier}.watch`,
  deploymentTarget: '10.0',
  icon: '../../assets/images/icon.png',
  colors: {
    $accent: '#C8F542',
    cream: '#F4F1E8',
    muted: '#8A9A8E',
    bg: '#0B1A12',
  },
  frameworks: ['WatchConnectivity', 'CoreLocation'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.shottrax.app'],
  },
});

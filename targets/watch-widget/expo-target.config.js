/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'watch-widget',
  name: 'ShotTraxx Hole',
  displayName: 'Hole',
  bundleIdentifier: `${config.ios.bundleIdentifier}.watch.widget`,
  deploymentTarget: '10.0',
  colors: {
    $accent: '#C8F542',
    $widgetBackground: '#0B1A12',
  },
  entitlements: {
    'com.apple.security.application-groups': ['group.com.shottrax.app'],
  },
});

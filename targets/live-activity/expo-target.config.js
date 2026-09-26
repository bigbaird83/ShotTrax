/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'ShotTraxxRound',
  displayName: 'Round',
  bundleIdentifier: `${config.ios.bundleIdentifier}.round`,
  deploymentTarget: '16.4',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  colors: {
    $accent: '#C8F542',
    $widgetBackground: '#0B1A12',
  },
});

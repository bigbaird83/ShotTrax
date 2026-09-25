/**
 * @bacons/apple-targets globs targets in lexicographic order, so
 * targets/watch-widget is configured before targets/watch exists. The watchOS
 * widget is then embedded in the iPhone app (Embed Foundation Extensions) and
 * never copied into the Watch app, so the face slot stays blank — the widget
 * view never runs, not even its "—" / Unavailable state.
 *
 * This mod runs on the same xcodeProjectBeta2 project. It must be listed in
 * app.json BEFORE @bacons/apple-targets: that plugin registers the mod
 * provider last, and Expo rejects any mod added after the provider. Mods
 * registered earlier still run after the provider's own edits.
 */
const { withMod } = require('expo/config-plugins');
const { PBXNativeTarget, PBXCopyFilesBuildPhase, PBXBuildFile } = require('@bacons/xcode');

function withWatchWidgetEmbed(config) {
  return withMod(config, {
    platform: 'ios',
    mod: 'xcodeProjectBeta2',
    action(config) {
      embedWatchWidget(config.modResults);
      return config;
    },
  });
}

function nativeTargets(project) {
  return project.rootObject.props.targets.filter((target) => PBXNativeTarget.is(target));
}

function isWatchApp(target) {
  return target.isWatchOSTarget();
}

function isWatchWidget(target) {
  if (isWatchApp(target)) return false;
  if (target.props.productType !== 'com.apple.product-type.app-extension') return false;
  const settings = target.getDefaultConfiguration()?.props?.buildSettings ?? {};
  return settings.SDKROOT === 'watchos' || Object.prototype.hasOwnProperty.call(settings, 'WATCHOS_DEPLOYMENT_TARGET');
}

function copyPhases(target) {
  return target.props.buildPhases.filter((phase) => PBXCopyFilesBuildPhase.is(phase));
}

function embedWatchWidget(project) {
  const targets = nativeTargets(project);
  const watchApp = targets.find(isWatchApp);
  const widgets = targets.filter(isWatchWidget);
  if (!watchApp) throw new Error('Watch widget embed: no watchOS app target');
  if (widgets.length !== 1) {
    throw new Error(`Watch widget embed: expected one watchOS widget, found ${widgets.length}`);
  }
  const widget = widgets[0];
  const watchId = watchApp.getDefaultBuildSetting('PRODUCT_BUNDLE_IDENTIFIER');
  const widgetId = widget.getDefaultBuildSetting('PRODUCT_BUNDLE_IDENTIFIER');
  const expected = `${watchId}.widget`;
  if (widgetId !== expected) {
    throw new Error(`Watch widget bundle id ${widgetId} must be ${expected}`);
  }

  const fileRef = widget.props.productReference;
  const carried = [];
  for (const target of targets) {
    for (const phase of copyPhases(target)) {
      const buildFile = phase.getBuildFile(fileRef);
      if (!buildFile) continue;
      const index = phase.props.files.findIndex((file) => file.uuid === buildFile.uuid);
      if (index >= 0) phase.props.files.splice(index, 1);
      carried.push(buildFile);
    }
  }

  let embed = copyPhases(watchApp).find((phase) => phase.props.name === 'Embed Foundation Extensions');
  if (!embed) {
    embed = watchApp.createBuildPhase(PBXCopyFilesBuildPhase, {
      name: 'Embed Foundation Extensions',
      dstPath: '',
      dstSubfolderSpec: 13,
      files: [],
    });
  }
  embed.ensureDefaultsForTarget(widget);
  if (embed.props.dstSubfolderSpec !== 13) embed.props.dstSubfolderSpec = 13;

  const keep = carried[0];
  if (keep) {
    if (!embed.props.files.some((file) => file.uuid === keep.uuid)) embed.props.files.push(keep);
    for (const extra of carried.slice(1)) extra.removeFromProject();
  } else if (!embed.getBuildFile(fileRef)) {
    embed.props.files.push(
      PBXBuildFile.create(project, {
        fileRef,
        settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
      }),
    );
  }

  for (const target of targets) {
    if (target.uuid === watchApp.uuid) continue;
    const dep = target.getDependencyForTarget(widget);
    if (dep) dep.removeFromProject();
  }
  watchApp.addDependency(widget);
}

module.exports = withWatchWidgetEmbed;

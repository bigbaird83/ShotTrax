/**
 * @bacons/apple-targets 5 ignores `infoPlist` on expo-target.config.js.
 * For a watch target it would write an empty Info.plist only when the file is
 * missing, and it never merges the config object. Xcode compiles
 * targets/watch/Info.plist (INFOPLIST_FILE, GENERATE_INFOPLIST_FILE = YES).
 * Copy the config keys into that file so the built app cannot miss them.
 */
const fs = require('fs');
const path = require('path');
const plistModule = require('@expo/plist');
const plist = plistModule.parse ? plistModule : plistModule.default;
const { withDangerousMod } = require('expo/config-plugins');

function watchTargetInfoPlist(projectRoot, expoConfig) {
  const configPath = path.join(projectRoot, 'targets/watch/expo-target.config.js');
  const loaded = require(configPath);
  const evaluated = typeof loaded === 'function' ? loaded(expoConfig) : loaded;
  return evaluated.infoPlist ?? {};
}

function samePlistValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Overlay `infoPlist` onto the existing watch Info.plist. Other keys stay. */
function mergeInfoPlist(plistText, infoPlist) {
  const parsed = plist.parse(plistText);
  let changed = false;
  for (const [key, value] of Object.entries(infoPlist)) {
    if (!samePlistValue(parsed[key], value)) {
      parsed[key] = value;
      changed = true;
    }
  }
  return { changed, text: changed ? plist.build(parsed) : plistText };
}

function withWatchInfoPlist(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const infoPlist = watchTargetInfoPlist(projectRoot, modConfig);
      const plistPath = path.join(projectRoot, 'targets/watch/Info.plist');
      const current = fs.readFileSync(plistPath, 'utf8');
      const merged = mergeInfoPlist(current, infoPlist);
      if (merged.changed) fs.writeFileSync(plistPath, merged.text);
      return modConfig;
    },
  ]);
}

module.exports = withWatchInfoPlist;
module.exports.mergeInfoPlist = mergeInfoPlist;
module.exports.watchTargetInfoPlist = watchTargetInfoPlist;

/**
 * Expo's legacy full-screen splash pins the image to the screen but records
 * it as 414×736. That aspect does not match the 784×1168 open frame, so the
 * launch image is not the same rect as the contained video. After the splash
 * plugin writes the storyboard, restore the real frame aspect and aspect-fit.
 */
const fs = require('fs');
const path = require('path');
const { withFinalizedMod } = require('expo/config-plugins');

const FRAME_W = 784;
const FRAME_H = 1168;

function patchSplashStoryboard(xml) {
  if (typeof xml !== 'string' || !xml.includes('SplashScreen')) return xml;
  let next = xml.replace(/contentMode="scaleAspectFill"/g, 'contentMode="scaleAspectFit"');
  next = next.replace(
    /(<image\b[^>]*\bname="SplashScreen(?:Legacy|Logo)"[^>]*\bwidth=")[^"]*(")/g,
    `$1${FRAME_W}$2`,
  );
  next = next.replace(
    /(<image\b[^>]*\bname="SplashScreen(?:Legacy|Logo)"[^>]*\bheight=")[^"]*(")/g,
    `$1${FRAME_H}$2`,
  );
  next = next.replace(
    /(<image\b[^>]*\bwidth=")[^"]*("[^>]*\bname="SplashScreen(?:Legacy|Logo)")/g,
    `$1${FRAME_W}$2`,
  );
  next = next.replace(
    /(<image\b[^>]*\bheight=")[^"]*("[^>]*\bname="SplashScreen(?:Legacy|Logo)")/g,
    `$1${FRAME_H}$2`,
  );
  return next;
}

function withSplashContain(config) {
  return withFinalizedMod(config, [
    'ios',
    async (config) => {
      const projectName = config.modRequest.projectName;
      if (!projectName) return config;
      const storyboardPath = path.join(
        config.modRequest.platformProjectRoot,
        projectName,
        'SplashScreen.storyboard',
      );
      if (!fs.existsSync(storyboardPath)) return config;
      const xml = fs.readFileSync(storyboardPath, 'utf8');
      const patched = patchSplashStoryboard(xml);
      if (patched !== xml) fs.writeFileSync(storyboardPath, patched);
      return config;
    },
  ]);
}

module.exports = withSplashContain;
module.exports.patchSplashStoryboard = patchSplashStoryboard;
module.exports.SPLASH_FRAME = { width: FRAME_W, height: FRAME_H };

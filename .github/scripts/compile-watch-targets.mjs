/**
 * Compile every Swift file under targets/ by building the targets prebuild just
 * generated: watchOS targets for the generic watchOS Simulator, and iPhone
 * widget extensions (the round Live Activity) for the generic iOS Simulator.
 * No signing.
 *
 * Expects `npx expo prebuild -p ios` to have already written ios/*.xcodeproj.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const derived = process.env.DERIVED_DATA_PATH || path.join(root, '.deriveddata');

function sanitizeTargetName(name) {
  return name.replace(/[\W_]+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function watchTargetConfigs() {
  const targetsDir = path.join(root, 'targets');
  const found = [];
  for (const entry of fs.readdirSync(targetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const configPath = path.join(targetsDir, entry.name, 'expo-target.config.js');
    if (!fs.existsSync(configPath)) continue;
    const loaded = require(configPath);
    const cfg = typeof loaded === 'function'
      ? loaded({
          ios: {
            bundleIdentifier: 'com.shottrax.app',
            entitlements: { 'com.apple.security.application-groups': ['group.com.shottrax.app'] },
          },
        })
      : loaded;
    if (cfg.type !== 'watch' && cfg.type !== 'watch-widget' && cfg.type !== 'widget') continue;
    const name = sanitizeTargetName(cfg.name || entry.name);
    if (!name) throw new Error(`Watch target in ${entry.name} has no usable name`);
    found.push({ name, type: cfg.type, dir: entry.name });
  }
  found.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'watch-widget' ? -1 : 1;
  });
  if (found.length === 0) throw new Error('No watch, watch-widget, or widget targets under targets/');
  return found;
}

function findProject() {
  const iosDir = path.join(root, 'ios');
  if (!fs.existsSync(iosDir)) throw new Error('ios/ is missing. Run npx expo prebuild -p ios first.');
  const projects = fs.readdirSync(iosDir).filter((name) => name.endsWith('.xcodeproj'));
  if (projects.length !== 1) {
    throw new Error(`Expected one ios/*.xcodeproj, found: ${projects.join(', ') || '(none)'}`);
  }
  return path.join(iosDir, projects[0]);
}

function findNativeTarget(pbx, name) {
  // apple-targets emits 24-char ids that include X, and the project uses tabs.
  const re = new RegExp(
    `([A-F0-9X]{24}) /\\* ${name} \\*/ = \\{\\n\\t+isa = PBXNativeTarget;([\\s\\S]*?)\\n\\t\\t\\};`,
  );
  const match = pbx.match(re);
  if (!match) return null;
  const product = match[2].match(/productReference = [A-F0-9X]{24} \/\* (.+?) \*\//);
  if (!product) throw new Error(`Target ${name} has no productReference`);
  return { uuid: match[1], body: match[2], productName: product[1] };
}

function writeScheme(projectPath, target) {
  const schemeDir = path.join(projectPath, 'xcshareddata', 'xcschemes');
  fs.mkdirSync(schemeDir, { recursive: true });
  const schemePath = path.join(schemeDir, `${target.name}.xcscheme`);
  if (fs.existsSync(schemePath)) {
    console.log(`Using existing scheme ${target.name}`);
    return;
  }
  const container = `container:${path.basename(projectPath)}`;
  const ref = `               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${target.uuid}"
               BuildableName = "${target.productName}"
               BlueprintName = "${target.name}"
               ReferencedContainer = "${container}"`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1600"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
${ref}>
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
${ref}>
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
${ref}>
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
`;
  fs.writeFileSync(schemePath, xml);
  console.log(`Wrote shared scheme ${target.name} (${target.productName})`);
}

function listSwiftFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSwiftFiles(full));
    else if (entry.name.endsWith('.swift')) files.push(path.relative(root, full));
  }
  return files;
}

function synchronizedDirsForTarget(pbx, target) {
  const groupIds = [...target.body.matchAll(/([A-F0-9X]{24}) \/\* [\w-]+ \*\//g)].map((match) => match[1]);
  const dirs = [];
  for (const id of groupIds) {
    const re = new RegExp(
      `${id} /\\* ([\\w-]+) \\*/ = \\{\\n\\t+isa = PBXFileSystemSynchronizedRootGroup;\\n\\t+path = "?([\\w.-]+)"?;([\\s\\S]*?)\\n\\t\\t\\};`,
    );
    const match = pbx.match(re);
    if (!match) continue;
    const folder = match[2];
    const exceptions = [...match[3].matchAll(/membershipExceptions = \(([\s\S]*?)\);/g)]
      .flatMap((block) => [...block[1].matchAll(/^\t+([^,\n]+),$/gm)].map((line) => line[1].replace(/"/g, '').trim()));
    // membershipExceptions live on a separate object. Read them from the target id instead.
    const exceptionBlock = pbx.match(
      new RegExp(
        `isa = PBXFileSystemSynchronizedBuildFileExceptionSet;\\n\\t+target = ${target.uuid} /\\* ${target.name} \\*/;\\n\\t+membershipExceptions = \\(([\\s\\S]*?)\\);`,
      ),
    );
    const excluded = exceptionBlock
      ? [...exceptionBlock[1].matchAll(/([A-Za-z0-9_.-]+)/g)].map((item) => item[1])
      : exceptions;
    dirs.push({ dir: path.join('targets', folder), excluded });
  }
  return dirs;
}

function assertSwiftFilesAreMembers(pbx, targets) {
  const swiftFiles = listSwiftFiles(path.join(root, 'targets'));
  if (swiftFiles.length === 0) throw new Error('No Swift files under targets/');
  const covered = new Map();
  for (const target of targets) {
    const dirs = synchronizedDirsForTarget(pbx, target);
    if (dirs.length === 0) {
      throw new Error(`Target ${target.name} has no synchronized source folder`);
    }
    for (const { dir, excluded } of dirs) {
      for (const file of listSwiftFiles(path.join(root, dir))) {
        if (excluded.includes(path.basename(file))) {
          throw new Error(`${file} is excluded from ${target.name} and will not be compiled`);
        }
        covered.set(file, target.name);
      }
    }
  }
  const missing = swiftFiles.filter((file) => !covered.has(file));
  if (missing.length) {
    throw new Error(`These Swift files are not in a target that this job builds:\n${missing.join('\n')}`);
  }
  console.log(`Every Swift file under targets/ is in a built target (${swiftFiles.length}):`);
  for (const file of swiftFiles) console.log(`  ${file} -> ${covered.get(file)}`);
  console.log(`Building: ${targets.map((target) => `${target.name} (${target.type})`).join(', ')}`);
}

function runXcodebuild(args) {
  return new Promise((resolve) => {
    const chunks = [];
    console.log(`\n$ xcodebuild ${args.join(' ')}\n`);
    const child = spawn('xcodebuild', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    const capture = (buf) => {
      process.stdout.write(buf);
      chunks.push(buf);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', (err) => {
      resolve({ code: 127, log: String(err) });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, log: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

function printErrors(log) {
  const lines = log.split('\n').filter((line) => /error:/i.test(line));
  if (lines.length === 0) return;
  console.error('\n--- xcodebuild errors ---');
  for (const line of lines) console.error(line);
  console.error('--- end xcodebuild errors ---\n');
}

function signingArgs() {
  return [
    'CODE_SIGNING_ALLOWED=NO',
    'CODE_SIGNING_REQUIRED=NO',
    'CODE_SIGN_IDENTITY=',
    'COMPILER_INDEX_STORE_ENABLE=NO',
  ];
}

function simulatorFor(target) {
  return target.type === 'widget'
    ? { sdk: 'iphonesimulator', destination: 'generic/platform=iOS Simulator' }
    : { sdk: 'watchsimulator', destination: 'generic/platform=watchOS Simulator' };
}

async function buildTarget(projectPath, target) {
  const sim = simulatorFor(target);
  const schemeArgs = [
    '-project', projectPath,
    '-scheme', target.name,
    '-configuration', 'Debug',
    '-sdk', sim.sdk,
    '-destination', sim.destination,
    '-derivedDataPath', derived,
    '-disableAutomaticPackageResolution',
    ...signingArgs(),
    'build',
  ];
  const schemeResult = await runXcodebuild(schemeArgs);
  if (schemeResult.code === 0) return;
  printErrors(schemeResult.log);
  const compiled = /CompileSwift|SwiftCompile|Compiling /.test(schemeResult.log);
  const swiftError = /\.swift:\d+:\d+: error:/.test(schemeResult.log);
  if (compiled || swiftError) {
    throw new Error(`xcodebuild failed for scheme ${target.name} (exit ${schemeResult.code})`);
  }
  console.error(`Scheme build for ${target.name} failed before compiling Swift. Retrying with -target.`);
  const targetArgs = [
    '-project', projectPath,
    '-target', target.name,
    '-configuration', 'Debug',
    '-sdk', sim.sdk,
    '-derivedDataPath', derived,
    '-disableAutomaticPackageResolution',
    ...signingArgs(),
    'build',
  ];
  const targetResult = await runXcodebuild(targetArgs);
  if (targetResult.code !== 0) {
    printErrors(targetResult.log);
    throw new Error(`xcodebuild failed for target ${target.name} (exit ${targetResult.code})`);
  }
}

function buildSettingsBlocks(pbx, target) {
  const listId = target.body.match(/buildConfigurationList = ([A-F0-9X]{24})/);
  if (!listId) throw new Error(`Target ${target.name} has no build configuration list`);
  const list = pbx.match(
    new RegExp(`${listId[1]} /\\* [^*]+ \\*/ = \\{[\\s\\S]*?buildConfigurations = \\(([\\s\\S]*?)\\);`),
  );
  if (!list) throw new Error(`Target ${target.name} configuration list was not found`);
  const configIds = [...list[1].matchAll(/([A-F0-9X]{24})/g)].map((match) => match[1]);
  return configIds.map((id) => {
    const block = pbx.match(
      new RegExp(`${id} /\\* [^*]+ \\*/ = \\{\\n\\t+isa = XCBuildConfiguration;([\\s\\S]*?)\\n\\t\\t\\};`),
    );
    if (!block) throw new Error(`Missing XCBuildConfiguration ${id} for ${target.name}`);
    return block[1];
  });
}

function copyPhaseOwner(pbx, phaseUuid) {
  const targets = [
    ...pbx.matchAll(
      /([A-F0-9X]{24}) \/\* ([^*]+) \*\/ = \{\n\t+isa = PBXNativeTarget;([\s\S]*?)\n\t\t\};/g,
    ),
  ];
  return targets
    .filter((match) => match[3].includes(phaseUuid))
    .map((match) => match[2].trim());
}

/**
 * The watch widget must be inside the Watch app. apple-targets embeds it in the
 * iPhone app when watch-widget is configured before the watch target exists.
 */
function assertWatchWidgetEmbedded(pbx) {
  const plist = fs.readFileSync(path.join(root, 'targets', 'watch-widget', 'Info.plist'), 'utf8');
  if (!plist.includes('com.apple.widgetkit-extension')) {
    throw new Error('targets/watch-widget/Info.plist is missing NSExtensionPointIdentifier com.apple.widgetkit-extension');
  }
  if (/WKApplication/.test(plist)) {
    throw new Error('targets/watch-widget/Info.plist must not set WKApplication');
  }

  const watchFound = findNativeTarget(pbx, 'ShotTraxxWatch');
  const widgetFound = findNativeTarget(pbx, 'ShotTraxxHole');
  if (!watchFound || !widgetFound) throw new Error('Prebuild did not create ShotTraxxWatch and ShotTraxxHole');
  const watch = { ...watchFound, name: 'ShotTraxxWatch' };
  const widget = { ...widgetFound, name: 'ShotTraxxHole' };
  if (!widget.productName.endsWith('.appex')) {
    throw new Error(`ShotTraxxHole product should be an appex, found ${widget.productName}`);
  }

  const widgetSettings = buildSettingsBlocks(pbx, widget);
  for (const settings of widgetSettings) {
    if (!settings.includes('PRODUCT_BUNDLE_IDENTIFIER = com.shottrax.app.watch.widget;')) {
      throw new Error('ShotTraxxHole bundle id must be com.shottrax.app.watch.widget');
    }
    if (!settings.includes('SDKROOT = watchos;')) {
      throw new Error('ShotTraxxHole SDKROOT must be watchos');
    }
    if (!/WATCHOS_DEPLOYMENT_TARGET = [^;]+;/.test(settings)) {
      throw new Error('ShotTraxxHole is missing WATCHOS_DEPLOYMENT_TARGET');
    }
  }
  const watchSettings = buildSettingsBlocks(pbx, watch);
  for (const settings of watchSettings) {
    if (!settings.includes('PRODUCT_BUNDLE_IDENTIFIER = com.shottrax.app.watch;')) {
      throw new Error('ShotTraxxWatch bundle id must be com.shottrax.app.watch so the widget id is prefixed by it');
    }
  }

  const buildFileRe = new RegExp(
    `([A-F0-9X]{24}) /\\* ${widget.productName} in ([^*]+) \\*/ = \\{[^}]*isa = PBXBuildFile;`,
    'g',
  );
  const buildFiles = [...pbx.matchAll(buildFileRe)];
  if (buildFiles.length === 0) {
    throw new Error(`${widget.productName} is not in any Copy Files build phase`);
  }
  const phaseRe =
    /([A-F0-9X]{24}) \/\* ([^*]+) \*\/ = \{\n\t+isa = PBXCopyFilesBuildPhase;([\s\S]*?)\n\t\t\};/g;
  const phases = [...pbx.matchAll(phaseRe)];
  const owners = [];
  for (const file of buildFiles) {
    const phase = phases.find((item) => item[3].includes(file[1]));
    if (!phase) throw new Error(`No copy phase contains build file ${file[1]} for ${widget.productName}`);
    const ownerNames = copyPhaseOwner(pbx, phase[1]);
    owners.push({ phase: phase[2], owners: ownerNames, body: phase[3] });
  }
  const inWatch = owners.filter((item) => item.owners.includes('ShotTraxxWatch'));
  if (inWatch.length !== 1) {
    throw new Error(
      `${widget.productName} must be embedded by ShotTraxxWatch exactly once, found ${inWatch.length} (${owners
        .map((item) => item.owners.join('+') || 'unowned')
        .join(', ')})`,
    );
  }
  if (!inWatch[0].body.includes('dstSubfolderSpec = 13;')) {
    throw new Error('Watch widget embed phase must use dstSubfolderSpec 13 (PlugIns)');
  }
  if (!/name = "Embed Foundation Extensions";/.test(inWatch[0].body) && !inWatch[0].phase.includes('Embed Foundation Extensions')) {
    throw new Error('Watch widget must sit in Embed Foundation Extensions on the watch app');
  }
  const inPhone = owners.filter((item) => item.owners.some((name) => name !== 'ShotTraxxWatch' && name !== 'ShotTraxxHole'));
  if (inPhone.length) {
    throw new Error(
      `${widget.productName} is still embedded in ${inPhone.map((item) => item.owners.join('+')).join(', ')} — it must only be in the Watch app`,
    );
  }

  const entitlements = path.join(root, 'ios', '.targets', 'ShotTraxxHole', 'generated.entitlements');
  if (!fs.existsSync(entitlements) || !fs.readFileSync(entitlements, 'utf8').includes('group.com.shottrax.app')) {
    throw new Error('ShotTraxxHole is missing the group.com.shottrax.app entitlement');
  }
  console.log('ShotTraxxHole.appex is embedded in ShotTraxxWatch (Embed Foundation Extensions).');
}

/**
 * The round Live Activity needs these in the iPhone app's generated Info.plist.
 * Checked after prebuild so a config plugin cannot drop them silently.
 */
function assertAppLiveActivityPlist() {
  const iosDir = path.join(root, 'ios');
  const candidates = fs
    .readdirSync(iosDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.endsWith('.xcodeproj'))
    .map((entry) => path.join(iosDir, entry.name, 'Info.plist'))
    .filter((file) => fs.existsSync(file))
    .filter((file) => fs.readFileSync(file, 'utf8').includes('<string>com.shottrax.app</string>') ||
      /CFBundleIdentifier<\/key>\s*<string>\$\(PRODUCT_BUNDLE_IDENTIFIER\)<\/string>/.test(fs.readFileSync(file, 'utf8')))
    .filter((file) => fs.readFileSync(file, 'utf8').includes('NSLocationWhenInUseUsageDescription'));
  if (candidates.length !== 1) {
    throw new Error(`Expected one iPhone app Info.plist under ios/, found: ${candidates.join(', ') || '(none)'}`);
  }
  const plist = fs.readFileSync(candidates[0], 'utf8');
  if (!/<key>NSSupportsLiveActivities<\/key>\s*<true\/>/.test(plist)) {
    throw new Error(`${candidates[0]} is missing NSSupportsLiveActivities = true`);
  }
  if (!/<key>UIBackgroundModes<\/key>\s*<array>[\s\S]*?<string>location<\/string>[\s\S]*?<\/array>/.test(plist)) {
    throw new Error(`${candidates[0]} is missing UIBackgroundModes location (Lock Screen yards stop when locked)`);
  }
  if (/NSLocationAlways/.test(plist)) {
    throw new Error(`${candidates[0]} must not ask for Always location`);
  }
  console.log(`${path.relative(root, candidates[0])}: Live Activities on, location background mode, no Always key.`);
}

async function main() {
  fs.mkdirSync(derived, { recursive: true });
  const configs = watchTargetConfigs();
  const projectPath = findProject();
  const pbxPath = path.join(projectPath, 'project.pbxproj');
  const pbx = fs.readFileSync(pbxPath, 'utf8');
  const targets = configs.map((config) => {
    const native = findNativeTarget(pbx, config.name);
    if (!native) {
      throw new Error(
        `Prebuild did not create an Xcode target named ${config.name}. ` +
          'Check ios/*.xcodeproj/project.pbxproj.',
      );
    }
    return { ...config, ...native };
  });
  assertSwiftFilesAreMembers(pbx, targets);
  assertWatchWidgetEmbedded(pbx);
  assertAppLiveActivityPlist();
  for (const target of targets) writeScheme(projectPath, target);
  for (const target of targets) await buildTarget(projectPath, target);
  console.log('\nWatch and widget compile succeeded.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

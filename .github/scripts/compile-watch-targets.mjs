/**
 * Compile every Swift file under targets/ by building the watchOS targets
 * prebuild just generated. No signing. Generic watchOS Simulator only.
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
    if (cfg.type !== 'watch' && cfg.type !== 'watch-widget') continue;
    const name = sanitizeTargetName(cfg.name || entry.name);
    if (!name) throw new Error(`Watch target in ${entry.name} has no usable name`);
    found.push({ name, type: cfg.type, dir: entry.name });
  }
  found.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'watch-widget' ? -1 : 1;
  });
  if (found.length === 0) throw new Error('No watch or watch-widget targets under targets/');
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
      throw new Error(`Target ${target.name} has no synchronized watch source folder`);
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
    throw new Error(`These Swift files are not in a watch target that this job builds:\n${missing.join('\n')}`);
  }
  console.log(`Every Swift file under targets/ is in a watch target (${swiftFiles.length}):`);
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

async function buildTarget(projectPath, target) {
  const schemeArgs = [
    '-project', projectPath,
    '-scheme', target.name,
    '-configuration', 'Debug',
    '-sdk', 'watchsimulator',
    '-destination', 'generic/platform=watchOS Simulator',
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
    '-sdk', 'watchsimulator',
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
  for (const target of targets) writeScheme(projectPath, target);
  for (const target of targets) await buildTarget(projectPath, target);
  console.log('\nWatch compile succeeded.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

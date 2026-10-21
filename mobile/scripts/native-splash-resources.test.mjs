import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(mobileRoot, 'package.json'));
const { AndroidConfig, XML, compileModsAsync, withPlugins } = require('expo/config-plugins');
const splashPluginRoot = path.join(path.dirname(require.resolve('expo-splash-screen/package.json')), 'plugin/build');
const { getAndroidSplashConfig } = require(path.join(splashPluginRoot, 'getAndroidSplashConfig.js'));
const { getIosSplashConfig } = require(path.join(splashPluginRoot, 'getIosSplashConfig.js'));
const { withAndroidRootViewBackgroundColor } = require(path.join(
  path.dirname(require.resolve('@expo/prebuild-config/package.json')),
  'build/plugins/unversioned/expo-system-ui/withAndroidRootViewBackgroundColor.js'
));
const resourceRelativePath = 'android/app/src/main/res';
const resourceRoot = path.join(mobileRoot, resourceRelativePath);
const olive = '#46552F';
const generatedFiles = [
  'drawable/splashscreen_logo.xml',
  'drawable-night/splashscreen_logo.xml',
  'drawable/ic_launcher_background.xml',
  'values/colors.xml',
  'values-night/colors.xml',
  'values/styles.xml'
];

function files(root, directory = '') {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? files(root, relative) : [relative];
  }).sort();
}

function hashes(root) {
  return Object.fromEntries(files(root).map((relative) => [
    relative, createHash('sha256').update(readFileSync(path.join(root, relative))).digest('hex')
  ]));
}

function loadFixtureConfig(fixture) {
  // A native resource check must never read local service selections or dotenv files.
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    key !== 'NODE_ENV' && key !== 'BABEL_ENV' &&
    !key.startsWith('EXPO_') && !key.startsWith('__EXPO_') && !key.startsWith('LISNO_')
  ));
  const result = spawnSync(process.execPath, ['-e', `
    const { getConfig } = require(${JSON.stringify(require.resolve('expo/config'))});
    process.stdout.write(JSON.stringify(getConfig(${JSON.stringify(fixture)}, { skipSDKVersionRequirement: true }).exp));
  `], { env: environment, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function generate(fixture, config, splash) {
  // Use the same installed mods as Expo prebuild, scoped to launch resources.
  // Do not run MainActivity, manifest, Gradle, or signing mods against the worktree.
  const resourceMods = ['withAndroidSplashImages', 'withAndroidSplashDrawables', 'withAndroidSplashStyles']
    .map((name) => [require(path.join(splashPluginRoot, `${name}.js`))[name], splash]);
  await compileModsAsync(withPlugins(structuredClone(config), [...resourceMods, withAndroidRootViewBackgroundColor]), {
    projectRoot: fixture, platforms: ['android']
  });
}

test('native launch resources are unbranded, match configuration, and preserve launcher assets', async (t) => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'lisno-native-splash-'));
  const fixtureResources = path.join(fixture, resourceRelativePath);
  const put = (relative, value) => {
    const destination = path.join(fixture, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, value);
  };

  try {
    put('package.json', JSON.stringify({ name: 'native-splash-fixture', version: '1.0.0' }));
    symlinkSync(path.join(mobileRoot, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
    for (const relative of ['app.config.ts', 'src/core/config/remoteHost.js', 'src/ui/startupTheme.js', 'assets/brand/startup-transparent.xml']) {
      put(relative, '');
      copyFileSync(path.join(mobileRoot, relative), path.join(fixture, relative));
    }
    cpSync(resourceRoot, fixtureResources, { recursive: true });
    const config = loadFixtureConfig(fixture);
    const splashProps = config.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')[1];
    const splash = getAndroidSplashConfig(splashProps);

    await t.test('neither platform config supplies a visible launch image', () => {
      assert.equal(config.backgroundColor, olive);
      assert.equal(config.icon, './assets/brand/icon.png');
      assert.deepEqual(config.android.adaptiveIcon, {
        backgroundColor: '#2f3a2a',
        foregroundImage: './assets/brand/icon-foreground.png',
        monochromeImage: './assets/brand/icon-monochrome.png'
      });
      assert.equal(splash.backgroundColor, olive);
      assert.equal(splash.dark.backgroundColor, olive);
      for (const theme of [splash, splash.dark]) {
        for (const image of ['image', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) assert.equal(theme[image], undefined);
      }
      const ios = getIosSplashConfig(splashProps);
      assert.equal(ios.backgroundColor, olive);
      for (const theme of [ios, ios.dark]) {
        assert.equal(theme.image, undefined);
        assert.equal(theme.tabletImage, undefined);
      }
    });

    await t.test('the supplied XML is a valid transparent drawable without bitmap or vector branding', async () => {
      const drawable = await XML.readXMLAsync({ path: path.join(mobileRoot, 'assets/brand/startup-transparent.xml') });
      assert.deepEqual(Object.keys(drawable), ['shape']);
      assert.equal(drawable.shape.$['android:shape'], 'rectangle');
      assert.deepEqual(drawable.shape.solid, [{ $: { 'android:color': '@android:color/transparent' } }]);
      assert.deepEqual(drawable.shape.size, [{ $: { 'android:width': '1dp', 'android:height': '1dp' } }]);
      assert.deepEqual(Object.keys(drawable.shape).sort(), ['$', 'size', 'solid']);
    });

    // Simulate an upgrade with old light and dark density-specific artwork.
    // Those qualifiers must be removed so they cannot win resource resolution.
    for (const theme of ['', 'night-']) {
      for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
        put(`${resourceRelativePath}/drawable-${theme}${density}/splashscreen_logo.png`, 'obsolete splash artwork');
      }
    }
    const before = hashes(fixtureResources);
    await generate(fixture, config, splash);
    const after = hashes(fixtureResources);

    await t.test('Expo generation removes every obsolete density image and preserves unrelated resources', () => {
      assert.deepEqual(files(fixtureResources).filter((relative) => /splashscreen_logo\./u.test(relative)), [
        'drawable-night/splashscreen_logo.xml', 'drawable/splashscreen_logo.xml'
      ]);
      for (const [relative, hash] of Object.entries(before)) {
        if (generatedFiles.includes(relative) || /splashscreen_logo\./u.test(relative)) continue;
        assert.equal(after[relative], hash, `Unrelated resource changed: ${relative}`);
      }
    });

    await t.test('generated light/dark backgrounds and native handoff resolve to olive', async () => {
      const read = (relative) => XML.readXMLAsync({ path: path.join(fixtureResources, relative) });
      const day = AndroidConfig.Colors.getColorsAsObject(await read('values/colors.xml'));
      const night = AndroidConfig.Colors.getColorsAsObject(await read('values-night/colors.xml'));
      assert.equal(day.splashscreen_background, olive);
      assert.equal(night.splashscreen_background ?? day.splashscreen_background, olive);
      assert.equal(day.activityBackground, olive);
      assert.equal(night.activityBackground ?? day.activityBackground, olive);
      assert.equal(day.iconBackground, '#2f3a2a');
      assert.equal(night.iconBackground ?? day.iconBackground, '#2f3a2a');
      const styles = (await read('values/styles.xml')).resources.style;
      const items = (name) => Object.fromEntries(styles.find((style) => style.$.name === name).item.map((item) => [item.$.name, item._]));
      assert.equal(items('AppTheme')['android:windowBackground'], '@color/activityBackground');
      assert.equal(items('Theme.App.SplashScreen').windowSplashScreenBackground, '@color/splashscreen_background');
      assert.equal(items('Theme.App.SplashScreen').windowSplashScreenAnimatedIcon, '@drawable/splashscreen_logo');
      assert.equal(items('Theme.App.SplashScreen').postSplashScreenTheme, '@style/AppTheme');
      const legacy = await read('drawable/ic_launcher_background.xml');
      assert.deepEqual(legacy['layer-list'].item, [{ $: { 'android:drawable': '@color/splashscreen_background' } }]);
      const transparentSource = readFileSync(path.join(fixture, 'assets/brand/startup-transparent.xml'));
      for (const relative of ['drawable/splashscreen_logo.xml', 'drawable-night/splashscreen_logo.xml']) {
        assert.deepEqual(readFileSync(path.join(fixtureResources, relative)), transparentSource);
      }
      for (const filename of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
        const launcher = await read(`mipmap-anydpi-v26/${filename}`);
        assert.equal(launcher['adaptive-icon'].background[0].$['android:drawable'], '@color/iconBackground');
        assert.equal(launcher['adaptive-icon'].foreground[0].$['android:drawable'], '@mipmap/ic_launcher_foreground');
      }
    });

    await t.test('tracked resources match generated output without a stale qualifier override', () => {
      for (const relative of generatedFiles) {
        assert.deepEqual(readFileSync(path.join(resourceRoot, relative)), readFileSync(path.join(fixtureResources, relative)), relative);
      }
      assert.deepEqual(files(resourceRoot).filter((relative) => /splashscreen_logo\./u.test(relative)), [
        'drawable-night/splashscreen_logo.xml', 'drawable/splashscreen_logo.xml'
      ]);
      assert.deepEqual(files(resourceRoot).filter((relative) => /(?:^|\/)values[^/]*\/(?:colors|styles)\.xml$/u.test(relative)), [
        'values-night/colors.xml', 'values/colors.xml', 'values/styles.xml'
      ]);
    });

    await t.test('repeated resource generation is byte-for-byte deterministic', async () => {
      await generate(fixture, config, splash);
      assert.deepEqual(hashes(fixtureResources), after);
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

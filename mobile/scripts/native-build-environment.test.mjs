import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(mobileRoot, 'package.json'));
const cliRoot = path.resolve(path.dirname(require.resolve('@expo/cli', {
  paths: [require.resolve('expo/package.json')]
})), '..');
const cliEnvironment = path.join(cliRoot, 'src/utils/nodeEnv.js');
const expoConfig = require.resolve('expo/config');
const metadataScript = path.join(path.dirname(require.resolve('expo-constants/package.json')), 'scripts/getAppConfig.js');
const preload = path.join(mobileRoot, 'scripts/lisno-node-environment.cjs');
const temporaryRoot = process.env.LISNO_NATIVE_BUILD_TEST_TMPDIR ?? tmpdir();
mkdirSync(temporaryRoot, { recursive: true });

// Never let a developer's selected service or inherited Expo dotenv marker enter fixtures.
const fixtureEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  key !== 'NODE_ENV' && key !== 'BABEL_ENV' &&
  !key.startsWith('EXPO_') && !key.startsWith('__EXPO_') && !key.startsWith('LISNO_')
));

test('bundle preload overrides conflicting NODE_ENV, while other Node commands are untouched', () => {
  for (const inherited of [undefined, 'development', 'production', 'test']) {
    for (const dev of ['true', 'false']) {
      const result = spawnSync(process.execPath, [
        '--require', preload, '-e',
        `require(${JSON.stringify(cliEnvironment)}).setNodeEnv(${JSON.stringify(dev === 'true' ? 'development' : 'production')}); process.stdout.write(process.env.NODE_ENV);`,
        '--', '--dev', dev
      ], { env: { ...fixtureEnvironment, ...(inherited === undefined ? {} : { NODE_ENV: inherited }) }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, dev === 'true' ? 'development' : 'production');
    }
  }
  const unchanged = spawnSync(process.execPath, ['--require', preload, '-e', 'process.stdout.write(process.env.NODE_ENV);'], {
    env: { ...fixtureEnvironment, NODE_ENV: 'test' }, encoding: 'utf8'
  });
  assert.equal(unchanged.status, 0, unchanged.stderr);
  assert.equal(unchanged.stdout, 'test');
});

test('Gradle tracks environment changes and matches Expo metadata to each requested variant', { timeout: 300_000 }, () => {
  const fixture = mkdtempSync(path.join(temporaryRoot, 'lisno-native-env-'));
  const android = path.join(fixture, 'android');
  const bundlePath = path.join(android, 'app/build/bundle.json');
  const metadataPath = path.join(android, 'expo-constants/build/app.config');
  const put = (relative, value) => {
    const destination = path.join(fixture, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, value);
  };
  const json = (filename) => JSON.parse(readFileSync(filename, 'utf8'));
  let invocation = 0;
  const build = (tasks, environment = {}, successful = true) => {
    const result = spawnSync(path.join(mobileRoot, 'android/gradlew'), [
      '--offline', '--console=plain', '-p', android, ...tasks
    ], { env: { ...fixtureEnvironment, ...environment }, encoding: 'utf8', timeout: 120_000 });
    writeFileSync(path.join(fixture, `gradle-${++invocation}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    assert.equal(result.status === 0, successful, output);
    assert.doesNotMatch(output, /NODE_ENV environment variable is required/);
    return output;
  };
  const assertBundled = (output) => {
    assert.match(output, /> Task :app:createBundleReleaseJsAndAssets(?:\r?\n|$)/);
    assert.doesNotMatch(output, /:app:createBundleReleaseJsAndAssets UP-TO-DATE/);
  };

  put('package.json', JSON.stringify({ name: 'native-build-environment-fixture', version: '1.0.0' }));
  symlinkSync(path.join(mobileRoot, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
  mkdirSync(path.join(fixture, 'src/core/config'), { recursive: true });
  mkdirSync(path.join(fixture, 'src/ui'), { recursive: true });
  copyFileSync(path.join(mobileRoot, 'app.config.ts'), path.join(fixture, 'app.config.ts'));
  copyFileSync(path.join(mobileRoot, 'src/core/config/remoteHost.js'), path.join(fixture, 'src/core/config/remoteHost.js'));
  copyFileSync(path.join(mobileRoot, 'src/ui/startupTheme.js'), path.join(fixture, 'src/ui/startupTheme.js'));
  put('.env', 'LISNO_APP_VARIANT=development\nEXPO_PUBLIC_API_ENV=remote\nEXPO_PUBLIC_REMOTE_API_URL=https://base.example/api/v1\n');
  put('.env.local', 'EXPO_PUBLIC_FIXTURE_LABEL=local-file\n');
  put('.env.production', 'EXPO_PUBLIC_REMOTE_API_URL=https://release.example/api/v1\n');
  put('.env.development', 'EXPO_PUBLIC_API_ENV=local\nEXPO_PUBLIC_LOCAL_API_URL=http://127.0.0.1:3000/api/v1\nLISNO_ALLOW_LOCAL_HTTP=1\n');
  put('resolve-bundle.cjs', `
    const fs = require('node:fs');
    const environment = require(${JSON.stringify(cliEnvironment)});
    environment.setNodeEnv('production');
    environment.loadEnvFiles(${JSON.stringify(fixture)}, { silent: true });
    const { exp } = require(${JSON.stringify(expoConfig)}).getConfig(${JSON.stringify(fixture)}, { skipSDKVersionRequirement: true });
    fs.writeFileSync(${JSON.stringify(bundlePath)}, JSON.stringify({
      mode: process.env.NODE_ENV,
      remoteUrl: process.env.EXPO_PUBLIC_REMOTE_API_URL,
      lisno: exp.extra.lisno
    }));
  `);
  put('android/settings.gradle', "rootProject.name = 'native-environment-fixture'\ninclude ':app', ':expo-constants'\n");
  mkdirSync(path.join(android, 'app'), { recursive: true });
  mkdirSync(path.join(android, 'expo-constants'), { recursive: true });
  mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
  for (const name of ['lisno-build-environment.gradle', 'lisno-node-environment.cjs']) {
    copyFileSync(path.join(mobileRoot, 'scripts', name), path.join(fixture, 'scripts', name));
  }
  put('android/build.gradle', `
    apply from: '../scripts/lisno-build-environment.gradle'
    project(':expo-constants') {
      tasks.register('createExpoConfig', Exec) { task ->
        workingDir rootProject.file('..')
        commandLine 'node', ${JSON.stringify(metadataScript)}, rootProject.file('..'), layout.buildDirectory.get().asFile
        outputs.file layout.buildDirectory.file('app.config')
        outputs.upToDateWhen { false }
        doFirst { layout.buildDirectory.get().asFile.mkdirs() }
        rootProject.ext.lisnoBuildEnvironment.configureMetadata(task)
      }
    }
    project(':app') {
      rootProject.ext.lisnoBuildEnvironment.registerVariant(path, 'release', false)
      rootProject.ext.lisnoBuildEnvironment.registerVariant(path, 'debug', true)
      tasks.register('preReleaseBuild') { dependsOn ':expo-constants:createExpoConfig' }
      tasks.register('preDebugBuild') { dependsOn ':expo-constants:createExpoConfig' }
      tasks.register('createBundleReleaseJsAndAssets', Exec) { task ->
        ext.devEnabled = objects.property(Boolean).convention(false)
        ext.nodeExecutableAndArgs = objects.listProperty(String).convention(['node'])
        outputs.file layout.buildDirectory.file('bundle.json')
        workingDir rootProject.file('..')
        doFirst {
          layout.buildDirectory.get().asFile.mkdirs()
          commandLine nodeExecutableAndArgs.get() + [rootProject.file('../resolve-bundle.cjs').path, '--dev', devEnabled.get().toString()]
        }
      }
      tasks.named('createBundleReleaseJsAndAssets').configure { task ->
        rootProject.ext.lisnoBuildEnvironment.configureBundle(task, rootProject.file('..'))
      }
      tasks.register('assembleRelease') { dependsOn 'preReleaseBuild', 'createBundleReleaseJsAndAssets' }
      tasks.register('bundleRelease') { dependsOn 'preReleaseBuild', 'createBundleReleaseJsAndAssets' }
      tasks.register('assembleDebug') { dependsOn 'preDebugBuild' }
    }
  `);

  try {
    assertBundled(build(['assembleRelease']));
    assert.equal(json(bundlePath).mode, 'production');
    assert.equal(json(bundlePath).remoteUrl, 'https://release.example/api/v1');
    assert.deepEqual(json(bundlePath).lisno, json(metadataPath).extra.lisno);
    assert.equal(json(metadataPath).extra.lisno.variant, 'development');
    assert.match(build([':app:bundleRelease'], { NODE_ENV: 'development' }), /:app:createBundleReleaseJsAndAssets UP-TO-DATE/);
    assert.deepEqual(json(bundlePath).lisno, json(metadataPath).extra.lisno);

    put('.env.production', 'EXPO_PUBLIC_REMOTE_API_URL=https://changed.example/api/v1\n');
    assertBundled(build([':app:createBundleReleaseJsAndAssets'], { NODE_ENV: 'development' }));
    assert.equal(json(bundlePath).mode, 'production');
    assert.equal(json(bundlePath).remoteUrl, 'https://changed.example/api/v1');
    assert.match(build([':app:createBundleReleaseJsAndAssets']), /:app:createBundleReleaseJsAndAssets UP-TO-DATE/);

    put('.env.production.local', 'EXPO_PUBLIC_REMOTE_API_URL=https://highest.example/api/v1\n');
    assertBundled(build([':app:createBundleReleaseJsAndAssets']));
    assert.equal(json(bundlePath).remoteUrl, 'https://highest.example/api/v1');
    rmSync(path.join(fixture, '.env.production.local'));
    assertBundled(build([':app:createBundleReleaseJsAndAssets']));
    assert.equal(json(bundlePath).remoteUrl, 'https://changed.example/api/v1');

    const shellOverride = { EXPO_PUBLIC_REMOTE_API_URL: 'https://shell.example/api/v1' };
    assertBundled(build([':app:createBundleReleaseJsAndAssets'], shellOverride));
    assert.equal(json(bundlePath).remoteUrl, shellOverride.EXPO_PUBLIC_REMOTE_API_URL);
    assert.match(build([':app:createBundleReleaseJsAndAssets'], shellOverride), /:app:createBundleReleaseJsAndAssets UP-TO-DATE/);

    put('.env.production', 'EXPO_PUBLIC_REMOTE_API_URL=https://\u0024{FIXTURE_API_HOST}/api/v1\n');
    assertBundled(build([':app:createBundleReleaseJsAndAssets'], { FIXTURE_API_HOST: 'interpolated.example' }));
    assert.equal(json(bundlePath).remoteUrl, 'https://interpolated.example/api/v1');
    assertBundled(build([':app:createBundleReleaseJsAndAssets'], { FIXTURE_API_HOST: 'updated.example' }));
    assert.equal(json(bundlePath).remoteUrl, 'https://updated.example/api/v1');

    put('.env.production', 'EXPO_PUBLIC_REMOTE_API_URL=https://${HOST_TEMPLATE}/api/v1\n');
    const nestedShell = { HOST_TEMPLATE: '${DEPLOYMENT_HOST}', DEPLOYMENT_HOST: 'before.example' };
    assertBundled(build([':app:createBundleReleaseJsAndAssets'], nestedShell));
    assert.equal(json(bundlePath).remoteUrl, 'https://before.example/api/v1');
    nestedShell.DEPLOYMENT_HOST = 'after.example';
    assertBundled(build([':app:createBundleReleaseJsAndAssets'], nestedShell));
    assert.equal(json(bundlePath).remoteUrl, 'https://after.example/api/v1');
    assert.match(build([':app:createBundleReleaseJsAndAssets'], nestedShell), /:app:createBundleReleaseJsAndAssets UP-TO-DATE/);

    put('.env.production', 'EXPO_PUBLIC_REMOTE_API_URL=https://${EXPO_PUBLIC_HOST_TEMPLATE}/api/v1\n');
    const publicShell = {
      EXPO_PUBLIC_HOST_TEMPLATE: '${DEPLOYMENT.HOST}',
      'DEPLOYMENT.HOST': '${123_HOST}',
      '123_HOST': 'public-before.example',
      // These unrelated public overrides exercise cycle protection without asking Expo to resolve a cycle.
      EXPO_PUBLIC_CYCLE_A: '${EXPO_PUBLIC_CYCLE_B}',
      EXPO_PUBLIC_CYCLE_B: '${EXPO_PUBLIC_CYCLE_A}'
    };
    assertBundled(build([':app:createBundleReleaseJsAndAssets'], publicShell));
    assert.equal(json(bundlePath).remoteUrl, 'https://public-before.example/api/v1');
    publicShell['123_HOST'] = 'public-after.example';
    assertBundled(build([':app:createBundleReleaseJsAndAssets'], publicShell));
    assert.equal(json(bundlePath).remoteUrl, 'https://public-after.example/api/v1');
    assert.match(build([':app:createBundleReleaseJsAndAssets'], publicShell), /:app:createBundleReleaseJsAndAssets UP-TO-DATE/);

    assertBundled(build([':app:createBundleReleaseJsAndAssets'], { EXPO_NO_DOTENV: '1', ...shellOverride }));
    assert.equal(json(bundlePath).remoteUrl, shellOverride.EXPO_PUBLIC_REMOTE_API_URL);
    build([':app:assembleDebug'], { NODE_ENV: 'production' });
    assert.equal(json(metadataPath).extra.lisno.apiEnvironment, 'local');
    assert.equal(json(metadataPath).extra.lisno.allowLocalHttp, true);

    assert.match(build([':app:assembleDebug', ':app:assembleRelease'], {}, false), /Build debug and release in separate Gradle invocations/);
    assert.match(build([':app:createBundleReleaseJsAndAssets'], { EXPO_PUBLIC_API_ENV: 'invalid' }, false), /EXPO_PUBLIC_API_ENV must be either/);
  } finally {
    // Keep only on request, making failed Gradle logs available without retaining runtime output by default.
    if (process.env.LISNO_KEEP_NATIVE_BUILD_TEST_OUTPUT !== '1') rmSync(fixture, { recursive: true, force: true });
    else console.log(`Native build fixture and logs: ${fixture}`);
  }
});

import type { ConfigContext } from "expo/config";

import { createAppConfig, selectedApiEnvironment } from "./app.config";
import { colors } from "./src/ui/tokens";

const context = { config: {} } as ConfigContext;
describe("Android app environment configuration", () => {
  it("keeps the native launch background and launcher aligned with the forest application theme", () => {
    const config = createAppConfig(context, {});

    expect(config.backgroundColor).toBe(colors.shell);
    expect(config.android?.adaptiveIcon?.backgroundColor).toBe(colors.shell);
    expect(config.plugins).toContainEqual([
      "expo-splash-screen",
      {
        backgroundColor: colors.shell,
        image: "./assets/brand/splash-icon.png",
        imageWidth: 112,
        resizeMode: "contain"
      }
    ]);
  });

  it("defaults to Remote and rejects unsupported selectors", () => {
    expect(selectedApiEnvironment(undefined)).toBe("remote");
    expect(() => selectedApiEnvironment("staging")).toThrow(
      "EXPO_PUBLIC_API_ENV"
    );
  });

  it("enables cleartext only for explicitly enabled non-production Local builds", () => {
    expect(createAppConfig(context, {
      LISNO_APP_VARIANT: "development",
      EXPO_PUBLIC_API_ENV: "local",
      LISNO_ALLOW_LOCAL_HTTP: "1"
    }).extra?.lisno).toMatchObject({
      apiEnvironment: "local",
      allowLocalHttp: true
    });

    expect(createAppConfig(context, {
      LISNO_APP_VARIANT: "development",
      EXPO_PUBLIC_API_ENV: "remote",
      LISNO_ALLOW_LOCAL_HTTP: "1"
    }).extra?.lisno).toMatchObject({
      apiEnvironment: "remote",
      allowLocalHttp: false
    });
  });

  it("rejects Local production configuration before URL validation", () => {
    expect(() =>
      createAppConfig(context, {
        LISNO_APP_VARIANT: "production",
        EXPO_PUBLIC_API_ENV: "local"
      })
    ).toThrow("Production Android builds require EXPO_PUBLIC_API_ENV=remote");
  });

  it.each([
    [undefined, "required"],
    ["http://api.example.test/api/v1", "deployed HTTPS origin"],
    ["https://127.0.0.2/api/v1", "deployed HTTPS origin"],
    ["https://[::1]/api/v1", "deployed HTTPS origin"],
    ["https://[::ffff:127.0.0.1]/api/v1", "deployed HTTPS origin"]
  ])("rejects unsafe production Remote URL %s", (remoteUrl, expected) => {
    expect(() =>
      createAppConfig(context, {
        LISNO_APP_VARIANT: "production",
        EXPO_PUBLIC_API_ENV: "remote",
        EXPO_PUBLIC_REMOTE_API_URL: remoteUrl,
        LISNO_ANDROID_PACKAGE: "com.lisno.mobile"
      })
    ).toThrow(expected);
  });

  it("accepts a valid production package and keeps Remote cleartext disabled", () => {
    const config = createAppConfig(context, {
      LISNO_APP_VARIANT: "production",
      EXPO_PUBLIC_API_ENV: "remote",
      EXPO_PUBLIC_REMOTE_API_URL: "https://api.lisno.com/api/v1",
      LISNO_ANDROID_PACKAGE: "com.lisno.mobile",
      LISNO_ALLOW_LOCAL_HTTP: "1"
    });

    expect(config.android?.package).toBe("com.lisno.mobile");
    expect(config.plugins).toContainEqual([
      "expo-build-properties",
      { android: { minSdkVersion: 24, usesCleartextTraffic: false } }
    ]);
    expect(config.extra?.lisno).toMatchObject({
      variant: "production",
      apiEnvironment: "remote",
      allowLocalHttp: false
    });
  });

  it("keeps camera and voice-note permissions in the generated plugin configuration", () => {
    const config = createAppConfig(context, {
      LISNO_APP_VARIANT: "development",
      EXPO_PUBLIC_API_ENV: "remote"
    });

    expect(config.android?.permissions).toEqual([
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO"
    ]);
    expect(config.plugins).toContainEqual([
      "expo-image-picker",
      {
        cameraPermission: "Allow Lisno to take project photos.",
        photosPermission: "Allow Lisno to choose project photos.",
        microphonePermission: "Allow Lisno to record project voice notes."
      }
    ]);
    expect(config.plugins).toContainEqual([
      "expo-audio",
      { microphonePermission: "Allow Lisno to record project voice notes." }
    ]);
  });
});

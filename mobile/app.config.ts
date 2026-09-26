import type { ExpoConfig, ConfigContext } from "expo/config";

import { isDisallowedRemoteHost } from "./src/core/config/remoteHost.js";

const BRAND_SHELL = "#2f3a2a";
const DEVELOPMENT_ANDROID_PACKAGE = "com.lisno.mobile.dev";

export const selectedApiEnvironment = (
  rawSelector: string | undefined
): "remote" | "local" => {
  const selector = rawSelector?.trim() || "remote";
  if (selector === "remote" || selector === "local") return selector;
  throw new Error('EXPO_PUBLIC_API_ENV must be either "remote" or "local".');
};

const productionAndroidPackage = (rawPackage: string | undefined): string => {
  const value = rawPackage?.trim();
  if (
    !value ||
    value === DEVELOPMENT_ANDROID_PACKAGE ||
    !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){1,}$/u.test(value)
  ) {
    throw new Error(
      "LISNO_ANDROID_PACKAGE must be set to the approved production application ID."
    );
  }
  return value;
};

const validateProductionRemoteUrl = (rawUrl: string | undefined): void => {
  if (!rawUrl?.trim()) {
    throw new Error("EXPO_PUBLIC_REMOTE_API_URL is required for production Android builds.");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("EXPO_PUBLIC_REMOTE_API_URL must be a valid HTTPS URL.");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    isDisallowedRemoteHost(host)
  ) {
    throw new Error("EXPO_PUBLIC_REMOTE_API_URL must use a deployed HTTPS origin without credentials, a query, or a fragment.");
  }
};

export const createAppConfig = (
  { config }: ConfigContext,
  environment: Readonly<Record<string, string | undefined>>
): ExpoConfig => {
  const variant = environment.LISNO_APP_VARIANT ?? "development";
  const production = variant === "production";
  const apiEnvironment = selectedApiEnvironment(environment.EXPO_PUBLIC_API_ENV);
  const allowLocalHttp =
    !production &&
    apiEnvironment === "local" &&
    environment.LISNO_ALLOW_LOCAL_HTTP === "1";

  if (production) {
    try {
      if (apiEnvironment !== "remote") {
        throw new Error("Production Android builds require EXPO_PUBLIC_API_ENV=remote.");
      }
      validateProductionRemoteUrl(environment.EXPO_PUBLIC_REMOTE_API_URL);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Remote API configuration is invalid.";
      throw new Error(`Production Android configuration rejected: ${reason}`);
    }
  }
  const androidPackage = production
    ? productionAndroidPackage(environment.LISNO_ANDROID_PACKAGE)
    : DEVELOPMENT_ANDROID_PACKAGE;

  return {
    ...config,
    name: production ? "Lisno" : "Lisno Dev",
    slug: "lisno-mobile",
    version: "0.1.0",
    orientation: "default",
    icon: "./assets/brand/icon.png",
    scheme: production ? "lisno" : "lisno-dev",
    userInterfaceStyle: "light",
    backgroundColor: BRAND_SHELL,
    ios: {
      bundleIdentifier: androidPackage
    },
    android: {
      package: androidPackage,
      adaptiveIcon: {
        backgroundColor: BRAND_SHELL,
        foregroundImage: "./assets/brand/icon-foreground.png",
        monochromeImage: "./assets/brand/icon-monochrome.png"
      },
      predictiveBackGestureEnabled: true,
      permissions: [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO"
      ]
    },
    plugins: [
      "expo-router",
      "expo-asset",
      "expo-secure-store",
      "expo-sharing",
      [
        "expo-image-picker",
        {
          cameraPermission: "Allow Lisno to take project photos.",
          photosPermission: "Allow Lisno to choose project photos.",
          // Expo ImagePicker's `false` value removes RECORD_AUDIO from the
          // whole merged manifest, including the permission owned by
          // expo-audio. Keep the same Lisno voice-note copy in both plugins.
          microphonePermission: "Allow Lisno to record project voice notes."
        }
      ],
      ["expo-audio", { microphonePermission: "Allow Lisno to record project voice notes." }],
      [
        "expo-splash-screen",
        {
          backgroundColor: BRAND_SHELL,
          image: "./assets/brand/splash-icon.png",
          imageWidth: 112,
          resizeMode: "contain"
        }
      ],
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 24,
            usesCleartextTraffic: allowLocalHttp
          }
        }
      ]
    ],
    experiments: { typedRoutes: true, reactCompiler: true },
    extra: {
      lisno: {
        variant,
        apiEnvironment,
        allowLocalHttp
      }
    }
  };
};

export default (context: ConfigContext): ExpoConfig =>
  createAppConfig(context, process.env);

import Constants from "expo-constants";

import {
  resolveEnvironmentConfiguration,
  type EnvironmentConfiguration
} from "./environment";

function runtimeBuildConfiguration(): {
  readonly allowLocalHttp: boolean;
  readonly production: boolean;
} {
  const extra = Constants.expoConfig?.extra;
  if (typeof extra !== "object" || extra === null) {
    return { allowLocalHttp: false, production: false };
  }
  const lisno = (extra as Record<string, unknown>).lisno;
  if (typeof lisno !== "object" || lisno === null) {
    return { allowLocalHttp: false, production: false };
  }
  const configuration = lisno as Record<string, unknown>;
  return {
    allowLocalHttp: configuration.allowLocalHttp === true,
    production: configuration.variant === "production"
  };
}

export function resolveRuntimeEnvironmentConfiguration(): EnvironmentConfiguration {
  const build = runtimeBuildConfiguration();
  return resolveEnvironmentConfiguration({
    selector: process.env.EXPO_PUBLIC_API_ENV,
    remoteUrl: process.env.EXPO_PUBLIC_REMOTE_API_URL,
    localUrl: process.env.EXPO_PUBLIC_LOCAL_API_URL,
    allowLocalHttp: build.allowLocalHttp,
    production: build.production
  });
}

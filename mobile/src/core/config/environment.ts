import { isDisallowedRemoteHost } from "./remoteHost.js";

export { isDisallowedRemoteHost } from "./remoteHost.js";

export const API_VERSION_PATH = "/api/v1" as const;

export type EnvironmentProfile = "remote" | "local";

export interface EnvironmentConfigurationInput {
  readonly selector?: string | undefined;
  readonly remoteUrl?: string | undefined;
  readonly localUrl?: string | undefined;
  readonly allowLocalHttp?: boolean | undefined;
  readonly production?: boolean | undefined;
}

export interface ResolvedEnvironment {
  readonly profile: EnvironmentProfile;
  readonly id: string;
  readonly apiBaseUrl: string;
  readonly origin: string;
  readonly host: string;
  readonly isLocal: boolean;
}

export interface EnvironmentConfiguration {
  readonly selectedProfile: EnvironmentProfile;
  readonly active: ResolvedEnvironment;
}

export class EnvironmentConfigurationError extends Error {
  readonly code = "INVALID_ENVIRONMENT_CONFIGURATION";

  constructor(
    message: string,
    readonly profile: EnvironmentProfile
  ) {
    super(message);
    this.name = "EnvironmentConfigurationError";
  }
}

const removeRepeatedApiSuffix = (pathname: string): string => {
  let normalized = pathname.replace(/\/+$/g, "");
  const apiSuffix = /\/api\/v1$/i;
  let prefix = normalized;
  let count = 0;

  while (apiSuffix.test(prefix)) {
    prefix = prefix.replace(apiSuffix, "");
    count += 1;
  }

  if (count > 0) {
    normalized = `${prefix}${API_VERSION_PATH}`;
  } else {
    normalized = `${normalized}${API_VERSION_PATH}`;
  }

  return normalized.replace(/^\/+/g, "/");
};

const environmentVariableForProfile = (profile: EnvironmentProfile): string =>
  profile === "remote"
    ? "EXPO_PUBLIC_REMOTE_API_URL"
    : "EXPO_PUBLIC_LOCAL_API_URL";

export function resolveEnvironmentProfile(
  rawSelector: string | undefined
): EnvironmentProfile {
  const selector = rawSelector?.trim() || "remote";
  if (selector === "remote" || selector === "local") return selector;

  throw new EnvironmentConfigurationError(
    'EXPO_PUBLIC_API_ENV must be either "remote" or "local".',
    "remote"
  );
}

export function resolveEnvironmentUrl(
  profile: EnvironmentProfile,
  rawUrl: string | undefined,
  options: { readonly allowLocalHttp?: boolean | undefined } = {}
): ResolvedEnvironment {
  const variableName = environmentVariableForProfile(profile);
  const configuredUrl = rawUrl?.trim();
  if (!configuredUrl) {
    throw new EnvironmentConfigurationError(
      `${variableName} is required when EXPO_PUBLIC_API_ENV=${profile}.`,
      profile
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new EnvironmentConfigurationError(
      `${variableName} must be a valid HTTP or HTTPS URL.`,
      profile
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new EnvironmentConfigurationError(
      `${variableName} must use HTTP or HTTPS.`,
      profile
    );
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new EnvironmentConfigurationError(
      `${variableName} cannot contain credentials, a query, or a fragment.`,
      profile
    );
  }
  if (profile === "remote" && parsed.protocol !== "https:") {
    throw new EnvironmentConfigurationError(
      "EXPO_PUBLIC_REMOTE_API_URL must use HTTPS.",
      profile
    );
  }
  if (profile === "remote" && isDisallowedRemoteHost(parsed.hostname)) {
    throw new EnvironmentConfigurationError(
      "EXPO_PUBLIC_REMOTE_API_URL must use a deployed HTTPS host.",
      profile
    );
  }
  if (
    profile === "local" &&
    parsed.protocol === "http:" &&
    options.allowLocalHttp !== true
  ) {
    throw new EnvironmentConfigurationError(
      "EXPO_PUBLIC_LOCAL_API_URL cannot use cleartext HTTP unless LISNO_ALLOW_LOCAL_HTTP=1 for a non-production build.",
      profile
    );
  }

  parsed.pathname = removeRepeatedApiSuffix(parsed.pathname);
  parsed.search = "";
  parsed.hash = "";
  const apiBaseUrl = parsed.toString().replace(/\/$/, "");
  const origin = parsed.origin;

  return Object.freeze({
    profile,
    id: `${profile}:${apiBaseUrl}`,
    apiBaseUrl,
    origin,
    host: parsed.host,
    isLocal: profile === "local"
  });
}

export function resolveEnvironmentConfiguration(
  input: EnvironmentConfigurationInput
): EnvironmentConfiguration {
  const selectedProfile = resolveEnvironmentProfile(input.selector);
  if (input.production === true && selectedProfile !== "remote") {
    throw new EnvironmentConfigurationError(
      "Production builds require EXPO_PUBLIC_API_ENV=remote.",
      selectedProfile
    );
  }

  const selectedUrl =
    selectedProfile === "remote" ? input.remoteUrl : input.localUrl;
  const active = resolveEnvironmentUrl(selectedProfile, selectedUrl, {
    allowLocalHttp:
      selectedProfile === "local" && input.production !== true
        ? input.allowLocalHttp
        : false
  });

  return Object.freeze({ selectedProfile, active });
}

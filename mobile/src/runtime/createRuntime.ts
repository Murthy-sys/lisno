import { CleanupRegistry } from "../core/config/cleanupRegistry";
import type { EnvironmentConfiguration } from "../core/config/environment";
import { EnvironmentManager } from "../core/config/environmentManager";
import { resolveRuntimeEnvironmentConfiguration } from "../core/config/runtimeEnvironment";
import { createJsonApiClient, type JsonApiClient } from "../core/http/apiClient";
import {
  createMobileQueryClient,
  registerQueryCleanup
} from "../core/query/queryClient";
import { SessionManager } from "../core/session/sessionManager";
import { SessionTokenState } from "../core/session/tokenState";
import { TokenVault } from "../core/session/tokenVault";
import {
  clearPendingImageSelection,
  createAuthenticatedResourceProvider,
  NativeTransferManager,
  purgeExpiredPendingImageSelection
} from "../platform/files";
import { AudioSessionManager } from "../platform/audio";
import { NativeSseClient } from "../platform/realtime";

export interface MobileRuntime {
  readonly configuration: EnvironmentConfiguration;
  readonly cleanups: CleanupRegistry;
  readonly environments: EnvironmentManager;
  readonly api: JsonApiClient;
  readonly session: SessionManager;
  readonly transfers: NativeTransferManager;
  readonly audio: AudioSessionManager;
  readonly realtime: NativeSseClient;
  readonly queryClient: ReturnType<typeof createMobileQueryClient>;
  dispose(): void;
}

export function createMobileRuntime(): MobileRuntime {
  const configuration = resolveRuntimeEnvironmentConfiguration();
  const cleanups = new CleanupRegistry();
  const environments = new EnvironmentManager(configuration.active);
  const tokenState = new SessionTokenState();
  let session: SessionManager | null = null;
  const api = createJsonApiClient({
    getEnvironmentSnapshot: environments.getSnapshot,
    tokenSource: tokenState,
    onUnauthorized: (context) => session?.handleUnauthorized(context)
  });
  const queryClient = createMobileQueryClient();
  const resources = createAuthenticatedResourceProvider({
    getEnvironmentSnapshot: environments.getSnapshot,
    getRequestToken: tokenState.getRequestToken.bind(tokenState)
  });
  const transfers = new NativeTransferManager(resources, cleanups);
  const audio = new AudioSessionManager(cleanups);
  const realtime = new NativeSseClient({ resources, cleanups });
  const unregisterPendingImageSelection = cleanups.register(
    "pending-image-selection",
    () => clearPendingImageSelection(),
    11
  );
  void purgeExpiredPendingImageSelection().catch(() => undefined);
  const unregisterHttp = api.registerCleanup(cleanups);
  const unregisterQuery = registerQueryCleanup(queryClient, cleanups);
  session = new SessionManager({
    apiClient: api,
    tokenVault: new TokenVault(configuration.active.id),
    tokenState,
    cleanups,
    getEnvironmentSnapshot: environments.getSnapshot
  });

  return {
    configuration,
    cleanups,
    environments,
    api,
    session,
    transfers,
    audio,
    realtime,
    queryClient,
    dispose() {
      unregisterPendingImageSelection();
      unregisterHttp();
      unregisterQuery();
      session?.dispose();
      void transfers.dispose();
      void audio.dispose();
      realtime.dispose();
      api.cancelAll();
      queryClient.clear();
    }
  };
}

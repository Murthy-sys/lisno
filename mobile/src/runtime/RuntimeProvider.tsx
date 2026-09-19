import { QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode
} from "react";

import type { EnvironmentSnapshot } from "../core/config/environmentManager";
import type { SessionSnapshot } from "../core/session/sessionManager";
import { createMobileQueryClient } from "../core/query/queryClient";
import { createMobileRuntime, type MobileRuntime } from "./createRuntime";

interface RuntimeReadyContext {
  readonly configured: true;
  readonly booted: boolean;
  readonly runtime: MobileRuntime;
  readonly environment: EnvironmentSnapshot;
  readonly session: SessionSnapshot;
  readonly initializationError: string | null;
  retryRestore(): Promise<void>;
}

interface RuntimeConfigurationErrorContext {
  readonly configured: false;
  readonly message: string;
}

export type RuntimeContextValue =
  | RuntimeReadyContext
  | RuntimeConfigurationErrorContext;

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

function useRuntimeSnapshot(runtime: MobileRuntime) {
  const environment = useSyncExternalStore(
    runtime.environments.subscribe.bind(runtime.environments),
    runtime.environments.getSnapshot,
    runtime.environments.getSnapshot
  );
  const session = useSyncExternalStore(
    runtime.session.subscribe.bind(runtime.session),
    runtime.session.getSnapshot,
    runtime.session.getSnapshot
  );
  return { environment, session };
}

function ConfiguredRuntimeProvider({
  children,
  runtime
}: {
  readonly children: ReactNode;
  readonly runtime: MobileRuntime;
}) {
  const { environment, session } = useRuntimeSnapshot(runtime);
  const [booted, setBooted] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  const retryRestore = useCallback(async () => {
    setInitializationError(null);
    try {
      await runtime.session.restore();
    } catch {
      setInitializationError("Lisno could not restore this session.");
    }
  }, [runtime]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        await runtime.session.restore();
      } catch {
        if (active) setInitializationError("Lisno could not finish startup.");
      } finally {
        if (active) setBooted(true);
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [runtime]);

  const value = useMemo<RuntimeReadyContext>(
    () => ({
      configured: true,
      booted,
      runtime,
      environment,
      session,
      initializationError,
      retryRestore
    }),
    [
      booted,
      environment,
      initializationError,
      retryRestore,
      runtime,
      session
    ]
  );

  return (
    <QueryClientProvider client={runtime.queryClient}>
      <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
    </QueryClientProvider>
  );
}

export function RuntimeProvider({ children }: { readonly children: ReactNode }) {
  const [runtimeResult] = useState<
    | { readonly runtime: MobileRuntime; readonly error: null }
    | { readonly runtime: null; readonly error: string }
  >(() => {
    try {
      return { runtime: createMobileRuntime(), error: null };
    } catch (error) {
      return {
        runtime: null,
        error: error instanceof Error ? error.message : "The backend configuration is invalid."
      };
    }
  });
  const [fallbackQueryClient] = useState(createMobileQueryClient);

  useEffect(
    () => () => {
      runtimeResult.runtime?.dispose();
      fallbackQueryClient.clear();
    },
    [fallbackQueryClient, runtimeResult]
  );

  if (!runtimeResult.runtime) {
    return (
      <QueryClientProvider client={fallbackQueryClient}>
        <RuntimeContext.Provider
          value={{ configured: false, message: runtimeResult.error }}
        >
          {children}
        </RuntimeContext.Provider>
      </QueryClientProvider>
    );
  }

  return (
    <ConfiguredRuntimeProvider runtime={runtimeResult.runtime}>
      {children}
    </ConfiguredRuntimeProvider>
  );
}

export function useRuntime(): RuntimeContextValue {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error("useRuntime must be used inside RuntimeProvider.");
  return value;
}

export function useConfiguredRuntime(): RuntimeReadyContext {
  const value = useRuntime();
  if (!value.configured) throw new Error(value.message);
  return value;
}

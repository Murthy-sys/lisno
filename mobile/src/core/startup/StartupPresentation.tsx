import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";

export type StartupPresentationPhase = "preparing" | "playing" | "settled";
export type StartupAssetsStatus = "pending" | "ready" | "failed";

type StartupPresentation = {
  phase: StartupPresentationPhase;
  readyForNavigation: boolean;
  complete: () => void;
};

const StartupPresentationContext = createContext<StartupPresentation>({
  phase: "settled",
  readyForNavigation: true,
  complete: () => undefined
});

const preparationDeadlineMs = 1000;
const presentationDeadlineMs = 4000;

function isBackgrounded(state: AppStateStatus | null) {
  return state === "background" || state === "inactive" || state === "extension";
}

/** Mount once at the ready application root, independently of routes and session state. */
export function StartupPresentationProvider({
  children,
  assetsStatus,
  reducedMotion,
  bypass,
  playbackReady = true
}: {
  children: ReactNode;
  assetsStatus: StartupAssetsStatus;
  reducedMotion: boolean | null;
  bypass: boolean;
  playbackReady?: boolean;
}) {
  const [phase, setPhase] = useState<StartupPresentationPhase>("preparing");
  const [appState, setAppState] = useState(AppState.currentState);
  const phaseRef = useRef<StartupPresentationPhase>("preparing");
  const mounted = useRef(false);
  const startedAt = useRef(Date.now());
  const preparationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presentationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (preparationTimer.current !== null) clearTimeout(preparationTimer.current);
    if (presentationTimer.current !== null) clearTimeout(presentationTimer.current);
    preparationTimer.current = null;
    presentationTimer.current = null;
  }, []);

  const complete = useCallback(() => {
    if (!mounted.current || phaseRef.current === "settled") return;
    phaseRef.current = "settled";
    clearTimers();
    setPhase("settled");
  }, [clearTimers]);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (!mounted.current) return;
      setAppState(nextState);
      if (isBackgrounded(nextState)) complete();
    });
    // Re-read after subscribing so a state change between render and setup cannot start an intro in the background.
    setAppState(AppState.currentState);
    if (isBackgrounded(AppState.currentState)) complete();

    if (phaseRef.current !== "settled") {
      const elapsed = Date.now() - startedAt.current;
      preparationTimer.current = setTimeout(() => {
        preparationTimer.current = null;
        if (phaseRef.current === "preparing") complete();
      }, Math.max(0, preparationDeadlineMs - elapsed));
      presentationTimer.current = setTimeout(complete, Math.max(0, presentationDeadlineMs - elapsed));
    }

    return () => {
      mounted.current = false;
      subscription.remove();
      clearTimers();
      // Cleanup must not settle: React may replay effects for this same launch.
    };
  }, [clearTimers, complete]);

  useEffect(() => {
    if (bypass || assetsStatus === "failed" || reducedMotion === true || isBackgrounded(appState)) {
      complete();
      return;
    }
    if (phaseRef.current === "playing" && reducedMotion === null) {
      complete();
      return;
    }
    if (phaseRef.current === "preparing" && playbackReady && assetsStatus === "ready" && reducedMotion === false && appState === "active") {
      if (Date.now() - startedAt.current >= preparationDeadlineMs) {
        complete();
        return;
      }
      phaseRef.current = "playing";
      setPhase("playing");
    }
  }, [appState, assetsStatus, bypass, complete, playbackReady, reducedMotion]);

  const value = useMemo(() => ({ phase, readyForNavigation: phase === "settled", complete }), [complete, phase]);
  return <StartupPresentationContext.Provider value={value}>{children}</StartupPresentationContext.Provider>;
}

export function useStartupPresentation() {
  return useContext(StartupPresentationContext);
}

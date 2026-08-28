import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { UNSAFE_DataRouterContext, useBlocker, type Blocker } from "react-router-dom";

export interface UnsavedKnowledgeGuardOptions {
  readonly hasUnsavedChanges: boolean;
  readonly onSave: () => Promise<boolean>;
  readonly onDiscard: () => void;
}

export interface UnsavedKnowledgeGuard {
  readonly dialogOpen: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly requestNavigation: (navigation: () => void) => void;
  readonly saveAndContinue: () => Promise<void>;
  readonly discardAndContinue: () => void;
  readonly stayHere: () => void;
}

export function useUnsavedKnowledgeGuard({
  hasUnsavedChanges,
  onSave,
  onDiscard
}: UnsavedKnowledgeGuardOptions): UnsavedKnowledgeGuard {
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const blocker = useOptionalBlocker(hasUnsavedChanges);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    setError(null);
    setDialogOpen(true);
  }, [blocker.state]);

  const finishNavigation = useCallback(() => {
    const navigation = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setDialogOpen(false);
    setError(null);
    if (blocker.state === "blocked") blocker.proceed();
    else navigation?.();
  }, [blocker]);

  const requestNavigation = useCallback(
    (navigation: () => void) => {
      if (!hasUnsavedChanges) {
        navigation();
        return;
      }
      pendingNavigationRef.current = navigation;
      setError(null);
      setDialogOpen(true);
    },
    [hasUnsavedChanges]
  );

  const saveAndContinue = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await onSave();
      if (saved) finishNavigation();
      else setError("Your changes were not saved. Review the section and try again.");
    } catch {
      setError("Your changes were not saved. Review the section and try again.");
    } finally {
      setBusy(false);
    }
  }, [finishNavigation, onSave]);

  const discardAndContinue = useCallback(() => {
    onDiscard();
    finishNavigation();
  }, [finishNavigation, onDiscard]);

  const stayHere = useCallback(() => {
    pendingNavigationRef.current = null;
    setDialogOpen(false);
    setError(null);
    if (blocker.state === "blocked") blocker.reset();
  }, [blocker]);

  return {
    dialogOpen,
    busy,
    error,
    requestNavigation,
    saveAndContinue,
    discardAndContinue,
    stayHere
  };
}

const IDLE_BLOCKER: Blocker = { state: "unblocked", proceed: undefined, reset: undefined, location: undefined };

function useOptionalBlocker(enabled: boolean): Blocker {
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  // The application always supplies a data router. Keeping the legacy idle path
  // allows isolated component tests and third-party embeds to render safely.
  return dataRouter ? useBlocker(enabled) : IDLE_BLOCKER;
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { ToastViewport, type SuccessToast } from "./ToastViewport";

export interface SuccessFeedback {
  title: string;
  message?: string;
  durationMs?: number;
}

export interface FeedbackApi {
  announce(message: string): void;
  success(input: SuccessFeedback): string;
  dismiss(id: string): void;
}

const DEFAULT_SUCCESS_DURATION_MS = 5_000;
const MAX_VISIBLE_TOASTS = 3;

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [announcement, setAnnouncement] = useState("");
  const [toasts, setToasts] = useState<SuccessToast[]>([]);
  const toastsRef = useRef<SuccessToast[]>([]);
  const viewportRef = useRef<HTMLElement>(null);
  const lastAnnouncementRef = useRef("");
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const restoreFocusIfOwned = useCallback((toast: SuccessToast) => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    const activeToast = activeElement.closest<HTMLElement>("[data-feedback-id]");
    if (activeToast?.dataset.feedbackId !== toast.id) return;

    if (toast.focusOrigin?.isConnected) {
      toast.focusOrigin.focus();
      return;
    }

    // The labelled, always-mounted viewport is the deterministic fallback
    // when the element that owned focus at creation no longer exists.
    viewportRef.current?.focus();
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      const toast = toastsRef.current.find((item) => item.id === id);
      if (!toast) {
        clearTimer(id);
        return;
      }
      restoreFocusIfOwned(toast);
      clearTimer(id);
      const next = toastsRef.current.filter((item) => item.id !== id);
      toastsRef.current = next;
      setToasts(next);
    },
    [clearTimer, restoreFocusIfOwned]
  );

  const announce = useCallback((message: string) => {
    if (!message) {
      lastAnnouncementRef.current = "";
      setAnnouncement("");
      return;
    }
    if (message === lastAnnouncementRef.current) return;
    lastAnnouncementRef.current = message;
    setAnnouncement(message);
  }, []);

  const success = useCallback(
    ({ title, message, durationMs }: SuccessFeedback) => {
      const id = `feedback-${++nextIdRef.current}`;
      const activeElement = document.activeElement;
      const focusOrigin =
        activeElement instanceof HTMLElement && activeElement !== document.body
          ? activeElement
          : null;
      const toast = { id, title, message, focusOrigin };
      announce(message ? `${title} ${message}` : title);

      const [oldest, ...remaining] = toastsRef.current;
      const next =
        toastsRef.current.length < MAX_VISIBLE_TOASTS
          ? [...toastsRef.current, toast]
          : [...remaining, toast];
      if (toastsRef.current.length >= MAX_VISIBLE_TOASTS && oldest) {
        restoreFocusIfOwned(oldest);
        clearTimer(oldest.id);
      }
      toastsRef.current = next;
      setToasts(next);

      const timer = setTimeout(
        () => dismiss(id),
        durationMs ?? DEFAULT_SUCCESS_DURATION_MS
      );
      timersRef.current.set(id, timer);

      return id;
    },
    [announce, clearTimer, dismiss, restoreFocusIfOwned]
  );

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    },
    []
  );

  const value = useMemo<FeedbackApi>(
    () => ({ announce, success, dismiss }),
    [announce, dismiss, success]
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <p
        className="sr-only"
        role="status"
        aria-label="Application announcements"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </p>
      <ToastViewport ref={viewportRef} toasts={toasts} onDismiss={dismiss} />
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const feedback = useContext(FeedbackContext);
  if (!feedback) {
    throw new Error("useFeedback must be used within a FeedbackProvider.");
  }
  return feedback;
}

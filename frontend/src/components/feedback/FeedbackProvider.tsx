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

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    },
    [clearTimer]
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
      const toast = { id, title, message };
      announce(message ? `${title} ${message}` : title);

      setToasts((current) => {
        if (current.length < MAX_VISIBLE_TOASTS) return [...current, toast];
        const [oldest, ...remaining] = current;
        if (oldest) clearTimer(oldest.id);
        return [...remaining, toast];
      });

      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((current) => current.filter((item) => item.id !== id));
      }, durationMs ?? DEFAULT_SUCCESS_DURATION_MS);
      timersRef.current.set(id, timer);

      return id;
    },
    [announce, clearTimer]
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
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
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

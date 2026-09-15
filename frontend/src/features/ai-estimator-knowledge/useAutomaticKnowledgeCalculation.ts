import { useCallback, useLayoutEffect, useRef, useState } from "react";

export const AUTOMATIC_CALCULATION_DELAY_MS = 300;

interface Options<T> {
  readonly inputKey: string;
  readonly enabled: boolean;
  readonly calculate: (signal: AbortSignal) => Promise<T>;
  readonly onResult?: (result: T | undefined) => void;
}

interface State<T> {
  readonly key: string;
  readonly phase: "idle" | "waiting" | "calculating";
  readonly settled: boolean;
  readonly result?: T;
  readonly error?: string;
}

/** Coordinates previews only; callers retain their request construction and response validation. */
export function useAutomaticKnowledgeCalculation<T>(options: Options<T>) {
  const { inputKey, enabled } = options;
  const latest = useRef(options);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<State<T>>({ key: inputKey, phase: enabled ? "waiting" : "idle", settled: false });

  useLayoutEffect(() => { latest.current = options; });

  const cancel = useCallback(() => {
    generation.current += 1;
    clearTimeout(timer.current);
    timer.current = undefined;
    controller.current?.abort();
    controller.current = undefined;
  }, []);

  // Call synchronously before changing inputs: even an already-resolved old promise is obsolete.
  const invalidate = useCallback(() => {
    cancel();
    const current = latest.current;
    setState({ key: current.inputKey, phase: current.enabled ? "waiting" : "idle", settled: false });
    current.onResult?.(undefined);
    setRevision((value) => value + 1);
  }, [cancel]);

  useLayoutEffect(() => {
    cancel();
    const sequence = generation.current;
    const snapshot = latest.current;
    setState({ key: inputKey, phase: enabled ? "waiting" : "idle", settled: false });
    snapshot.onResult?.(undefined);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      if (sequence !== generation.current) return;
      if (!enabled) {
        setState({ key: inputKey, phase: "idle", settled: true });
        return;
      }
      const requestController = new AbortController();
      controller.current = requestController;
      setState({ key: inputKey, phase: "calculating", settled: true });
      const isCurrent = () => sequence === generation.current && !requestController.signal.aborted;
      void (async () => {
        try {
          const result = await snapshot.calculate(requestController.signal);
          if (!isCurrent()) return;
          setState({ key: inputKey, phase: "idle", settled: true, result });
          latest.current.onResult?.(result);
        } catch (failure) {
          if (!isCurrent()) return;
          setState({ key: inputKey, phase: "idle", settled: true,
            error: failure instanceof Error ? failure.message : "Calculation unavailable. Please retry." });
        } finally {
          if (isCurrent()) controller.current = undefined;
        }
      })();
    }, AUTOMATIC_CALCULATION_DELAY_MS);
    // Preserve an accepted external summary on close; only edits/new context clear that summary.
    return cancel;
  }, [inputKey, enabled, revision, cancel]);

  const current: State<T> = state.key === inputKey ? state : { key: inputKey, phase: enabled ? "waiting" : "idle", settled: false };
  const retry = useCallback(() => {
    if (latest.current.enabled) invalidate();
  }, [invalidate]);

  return { ...current, invalidate, retry, cancel };
}

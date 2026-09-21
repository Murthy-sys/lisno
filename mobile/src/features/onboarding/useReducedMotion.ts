import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export type ReducedMotionPreference = boolean | null;

export function useReducedMotion(override?: boolean): ReducedMotionPreference {
  const [systemValue, setSystemValue] = useState<ReducedMotionPreference>(null);

  useEffect(() => {
    if (override !== undefined) {
      return;
    }

    let mounted = true;
    let receivedChange = false;
    setSystemValue(null);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        receivedChange = true;
        if (mounted) setSystemValue(value);
      }
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted && !receivedChange) setSystemValue(value);
      })
      .catch(() => {
        if (mounted && !receivedChange) setSystemValue(true);
      });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [override]);

  return override !== undefined ? override : systemValue;
}

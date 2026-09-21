import { useEffect, useState } from "react";

import { onboardingCompletion } from "./onboardingCompletion";

interface CompletionResolution {
  readonly enabled: boolean;
  readonly value: boolean | null;
}

export function useOnboardingCompletion(enabled: boolean): boolean | null {
  const [resolution, setResolution] = useState<CompletionResolution>({
    enabled: false,
    value: null
  });

  useEffect(() => {
    let active = true;
    setResolution({ enabled, value: null });
    if (!enabled) {
      return () => {
        active = false;
      };
    }

    void onboardingCompletion.isComplete().then((value) => {
      if (active) setResolution({ enabled: true, value });
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return resolution.enabled === enabled ? resolution.value : null;
}

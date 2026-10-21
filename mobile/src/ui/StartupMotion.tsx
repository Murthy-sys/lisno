import { createContext } from "react";

import type { ReducedMotionPreference } from "../features/onboarding/useReducedMotion";

/** Resolved during font loading, before the first visible startup frame. */
export const StartupMotionContext = createContext<ReducedMotionPreference>(null);

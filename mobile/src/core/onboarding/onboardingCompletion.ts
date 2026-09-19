import AsyncStorage from "@react-native-async-storage/async-storage";

export const ONBOARDING_COMPLETION_KEY = "lisno.onboarding.complete.v1";

const COMPLETED_VALUE = "complete";

export interface OnboardingCompletionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface OnboardingCompletionStore {
  isComplete(): Promise<boolean>;
  complete(): Promise<boolean>;
}

export function createOnboardingCompletionStore(
  storage: OnboardingCompletionStorage = AsyncStorage
): OnboardingCompletionStore {
  return Object.freeze({
    async isComplete(): Promise<boolean> {
      try {
        return (await storage.getItem(ONBOARDING_COMPLETION_KEY)) === COMPLETED_VALUE;
      } catch {
        return false;
      }
    },

    async complete(): Promise<boolean> {
      try {
        await storage.setItem(ONBOARDING_COMPLETION_KEY, COMPLETED_VALUE);
        return true;
      } catch {
        return false;
      }
    }
  });
}

export const onboardingCompletion = createOnboardingCompletionStore();

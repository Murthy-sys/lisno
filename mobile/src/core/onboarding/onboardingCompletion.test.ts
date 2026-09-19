import {
  ONBOARDING_COMPLETION_KEY,
  createOnboardingCompletionStore,
  type OnboardingCompletionStorage
} from "./onboardingCompletion";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

function storage(overrides: Partial<OnboardingCompletionStorage> = {}) {
  return {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    ...overrides
  } satisfies OnboardingCompletionStorage;
}

describe("onboarding completion", () => {
  it("treats an absent value as incomplete", async () => {
    const adapter = storage();

    await expect(createOnboardingCompletionStore(adapter).isComplete()).resolves.toBe(false);
    expect(adapter.getItem).toHaveBeenCalledWith(ONBOARDING_COMPLETION_KEY);
  });

  it("recognizes only the versioned completed value", async () => {
    const completedStorage = storage({ getItem: jest.fn(async () => "complete") });
    const malformedStorage = storage({ getItem: jest.fn(async () => "true") });

    await expect(createOnboardingCompletionStore(completedStorage).isComplete()).resolves.toBe(true);
    await expect(createOnboardingCompletionStore(malformedStorage).isComplete()).resolves.toBe(false);
  });

  it("treats a storage read failure as incomplete", async () => {
    const adapter = storage({
      getItem: jest.fn(async () => {
        throw new Error("storage unavailable");
      })
    });

    await expect(createOnboardingCompletionStore(adapter).isComplete()).resolves.toBe(false);
  });

  it("writes only the versioned completion key", async () => {
    const adapter = storage();

    await expect(createOnboardingCompletionStore(adapter).complete()).resolves.toBe(true);
    expect(adapter.setItem).toHaveBeenCalledWith(ONBOARDING_COMPLETION_KEY, "complete");
  });

  it("returns a failed result instead of throwing when storage cannot write", async () => {
    const adapter = storage({
      setItem: jest.fn(async () => {
        throw new Error("storage unavailable");
      })
    });

    await expect(createOnboardingCompletionStore(adapter).complete()).resolves.toBe(false);
  });
});

export type OnboardingSceneVariant = "plan" | "collaborate" | "deliver";

export type OnboardingSlide = Readonly<{
  id: OnboardingSceneVariant;
  eyebrow: string;
  title: string;
  body: string;
  sceneActionLabel: string;
  primaryActionLabel: "Next" | "Sign in to Lisno";
}>;

export const ONBOARDING_SLIDES = [
  {
    id: "plan",
    eyebrow: "PLAN",
    title: "Every project, clearly mapped.",
    body: "See milestones, tasks and drawings in one shared operating view.",
    sceneActionLabel: "Explore project layers",
    primaryActionLabel: "Next"
  },
  {
    id: "collaborate",
    eyebrow: "COLLABORATE",
    title: "Keep every handoff moving.",
    body: "Bring site teams, office teams, clients and conversations together around the next decision.",
    sceneActionLabel: "Trace the handoff",
    primaryActionLabel: "Next"
  },
  {
    id: "deliver",
    eyebrow: "DELIVER",
    title: "Build with confidence.",
    body: "Stay close to approvals, procurement, costs and progress—from first scope to final handover.",
    sceneActionLabel: "See delivery align",
    primaryActionLabel: "Sign in to Lisno"
  }
] as const satisfies readonly [OnboardingSlide, OnboardingSlide, OnboardingSlide];

import { ONBOARDING_SLIDES } from "./slides";

describe("onboarding slide model", () => {
  it("contains exactly the three approved Lisno introduction slides", () => {
    expect(ONBOARDING_SLIDES).toHaveLength(3);
    expect(ONBOARDING_SLIDES).toEqual([
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
    ]);
  });

  it("offers sign in only after both introductory steps", () => {
    expect(ONBOARDING_SLIDES.map((slide) => slide.primaryActionLabel)).toEqual([
      "Next",
      "Next",
      "Sign in to Lisno"
    ]);
  });
});

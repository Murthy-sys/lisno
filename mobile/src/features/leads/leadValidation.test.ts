import { validateLeadDraft, type LeadDraft } from "./leadValidation";

const valid: LeadDraft = { clientName: "Ananya", clientEmail: "ananya@example.com", clientMobile: "9000000000", projectName: "Courtyard", location: "Pune", propertyType: "Villa", budgetMin: "100", budgetMax: "200", source: "Referral", nextAction: "Site visit", nextActionAt: "2026-09-20T10:00:00+05:30" };

describe("lead validation", () => {
  it("normalizes a complete lead for the backend", () => {
    expect(validateLeadDraft(valid)).toEqual({ value: expect.objectContaining({ budgetMin: 100, budgetMax: 200, nextActionAt: "2026-09-20T04:30:00.000Z" }) });
  });
  it("rejects an inverted budget", () => expect(validateLeadDraft({ ...valid, budgetMax: "99" }).error).toMatch(/Maximum/));
  it("rejects invalid contact and schedule values", () => {
    expect(validateLeadDraft({ ...valid, clientEmail: "bad" }).error).toMatch(/email/);
    expect(validateLeadDraft({ ...valid, nextActionAt: "later" }).error).toMatch(/date and time/);
  });
});

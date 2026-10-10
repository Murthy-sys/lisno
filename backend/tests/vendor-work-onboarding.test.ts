import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createUserInvitationService } from "../src/services/user-invitation.service.js";
import { vendorWorkMailTemplate } from "../src/services/vendor-work-mail-template.js";
import type { VendorWorkInvitationAuthority } from "../src/domain/user-invitations.js";
const NOW = new Date("2026-10-08T06:00:00Z");
const authority: VendorWorkInvitationAuthority = { kind: "vendor_work_order", sourceIntentId: "access-one", vendorId: "vendor-one", emailNormalized: "vendor@example.test" };
function fixture() {
  const seed = structuredClone(demoSeedData);
  const original = seed.users.find(user => user.role === "super_admin")!;
  seed.users = [{ ...original, id: "issuer", email: "issuer@example.test", emailNormalized: "issuer@example.test", role: "procurement", accountKind: "standard" }];
  seed.userInvitations = []; seed.projects = []; seed.auditEvents = [];
  seed.vendorInvitationTargets = [{ id: "vendor-one", status: "active" }];
  seed.vendorWorkInvitationSources = ["access-one", "access-two"].map(sourceIntentId => ({ sourceIntentId, vendorId: "vendor-one", projectId: "project-one", actorId: "issuer", name: "Vendor Contact", email: "vendor@example.test", mobile: "+919000000000" }));
  const repository = createMemoryRepository(seed);
  const sends: any[] = []; let now = NOW;
  const mailer = { deliveryKind: "local_test" as const, sendInvitation: vi.fn(async (input: any) => { sends.push(input); }) };
  const service = createUserInvitationService({ repository, audit: createAuditService(repository), mailer, clock: () => now, passwordHasher: async () => "hashed-password", randomBytes: () => Buffer.alloc(32, sends.length + 1) });
  return { seed, repository, service, sends, mailer, advance: () => { now = new Date(now.getTime() + 61_000); } };
}
describe("vendor work invitation authority", () => {
  it("uses issued-work authority without a forged Super Admin and reuses setup across orders", async () => {
    const f = fixture();
    const created = await f.service.createForVendorWork(authority);
    expect(created.invitedBy.role).toBe("procurement");
    expect(created.currentLinkAvailable).toBe(true);
    expect((await f.repository.pageUserInvitations({}, { limit: 20, offset: 0 }, NOW.toISOString())).items[0]?.currentLinkAvailable).toBe(true);
    const reused = await f.service.createForVendorWork({ ...authority, sourceIntentId: "access-two" });
    expect(reused.id).toBe(created.id); expect(f.sends).toHaveLength(1);
    await expect(f.service.accept({ rawToken: f.sends[0].rawToken, password: "StrongPassword!123" })).resolves.toEqual({ accepted: true });
    const user = await f.repository.findUserByEmail(authority.emailNormalized);
    expect(user).toMatchObject({ role: "vendor", vendorId: "vendor-one", active: true });
    await expect(f.service.accept({ rawToken: f.sends[0].rawToken, password: "StrongPassword!123" })).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  });
  it("disabled preflight creates no token, invitation or audit", async () => {
    const f = fixture(); const randomBytes = vi.fn(() => Buffer.alloc(32));
    const service = createUserInvitationService({ repository: f.repository, audit: createAuditService(f.repository), mailer: { deliveryKind: "disabled" }, clock: () => NOW, randomBytes });
    await expect(service.createForVendorWork(authority)).rejects.toMatchObject({ code: "INVITATION_DELIVERY_UNAVAILABLE" });
    expect(randomBytes).not.toHaveBeenCalled();
    expect(await f.repository.findPendingUserInvitationByEmail(authority.emailNormalized)).toBeNull();
    expect((await f.repository.pageAuditEvents({}, { limit: 20, offset: 0 })).items).toHaveLength(0);
  });
  it("rejects a mismatched source vendor or email", async () => {
    const f = fixture();
    await expect(f.service.createForVendorWork({ ...authority, vendorId: "vendor-two" })).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    await expect(f.service.createForVendorWork({ ...authority, emailNormalized: "other@example.test" })).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    expect(f.sends).toHaveLength(0);
  });
  it("serializes concurrent setup requests and concurrent acceptance", async () => {
    const f = fixture();
    const results = await Promise.allSettled([f.service.createForVendorWork(authority), f.service.createForVendorWork({ ...authority, sourceIntentId: "access-two" })]);
    expect(results.filter(row => row.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    expect(f.sends).toHaveLength(1);
    const accepted = await Promise.allSettled([1, 2].map(() => f.service.accept({ rawToken: f.sends[0].rawToken, password: "StrongPassword!123" })));
    expect(accepted.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect((await f.repository.listUsers()).filter(row => row.vendorId === "vendor-one")).toHaveLength(1);
  });
  it("does not rotate a still-delivering setup generation for another work order", async () => {
    const f = fixture();
    let release!: () => void;
    let started!: () => void;
    const sending = new Promise<void>(resolve => { started = resolve; });
    f.mailer.sendInvitation.mockImplementationOnce(async input => { f.sends.push(input); started(); await new Promise<void>(resolve => { release = resolve; }); });
    const first = f.service.createForVendorWork(authority);
    await sending; f.advance();
    await expect(f.service.createForVendorWork({ ...authority, sourceIntentId: "access-two" })).rejects.toMatchObject({ code: "INVITATION_DELIVERY_IN_PROGRESS" });
    expect((await f.repository.findPendingUserInvitationByEmail(authority.emailNormalized))?.tokenGeneration).toBe(1);
    release(); await first;
  });
  it("rechecks current source at public inspection and acceptance", async () => {
    const f = fixture(); await f.service.createForVendorWork(authority);
    f.repository.findVendorWorkInvitationSource = vi.fn(async () => null);
    await expect(f.service.inspect(f.sends[0].rawToken)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    await expect(f.service.accept({ rawToken: f.sends[0].rawToken, password: "StrongPassword!123" })).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  });
  it("blocks existing differently bound or inactive vendor accounts without reactivation", async () => {
    const f = fixture();
    const { id: _id, ...user } = (await f.repository.listUsers())[0]!;
    await f.repository.createUser({ ...user, email: "existing@example.test", emailNormalized: "existing@example.test", role: "vendor", vendorId: "vendor-one", active: false });
    await expect(f.service.createForVendorWork(authority)).rejects.toMatchObject({ code: "INVITATION_NOT_ACTIONABLE" });
    expect(f.sends).toHaveLength(0);
  });
  it("escapes mail content and links only to authenticated assigned work", () => {
    const message = vendorWorkMailTemplate({ recipient: { name: "<script>", email: "vendor@example.test" }, projectId: "p", orderId: "o", setupPending: true }, "https://lisno.example");
    expect(message.html).toContain("&lt;script&gt;"); expect(message.html).not.toContain("<script>");
    expect(message.text).toContain("previously sent invitation"); expect(message.text).toContain("https://lisno.example/vendor");
  });
});

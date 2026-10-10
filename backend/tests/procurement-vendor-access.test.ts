import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createUserInvitationService } from "../src/services/user-invitation.service.js";
import { vendorInvitationCommandSchema, vendorOrderAccessCommandSchema } from "../src/routes/procurement-vendor-access.js";
import type { ProcurementVendorInvitationAuthority } from "../src/domain/user-invitations.js";
const NOW = new Date("2026-10-09T06:00:00Z");
const authority: ProcurementVendorInvitationAuthority = { kind: "procurement_vendor", sourceIntentId: "manual-one", vendorId: "v-one", emailNormalized: "vendor@example.test" };
const command = { commandId: "manual-request-one", resend: false, invitationId: null, expectedInvitationVersion: null };
function fixture() {
  const seed = structuredClone(demoSeedData); const original = seed.users.find(row => row.role === "super_admin")!;
  seed.users = [{ ...original, id: "issuer", email: "issuer@example.test", emailNormalized: "issuer@example.test", role: "procurement", accountKind: "standard", version: 1 }];
  seed.projects = []; seed.auditEvents = []; seed.userInvitations = []; seed.vendorInvitationTargets = [{ id: "v-one", status: "active" }];
  seed.procurementVendorInvitationSources = [{ sourceIntentId: "manual-one", vendorId: "v-one", actorId: "issuer", actorVersion: 1, name: "Vendor", email: "vendor@example.test", mobile: "+919000000000" }];
  const repository = createMemoryRepository(seed); const sends: any[] = []; let now = NOW;
  const mailer = { deliveryKind: "local_test" as const, sendInvitation: vi.fn(async (input: any) => { sends.push(input); }) };
  const service = createUserInvitationService({ repository, audit: createAuditService(repository), mailer, clock: () => now, passwordHasher: async () => "hash" });
  return { repository, sends, service, mailer, advance: () => { now = new Date(now.getTime() + 61_000); } };
}
describe("Procurement invitation source authority", () => {
  it("creates and accepts a vendor account before any issued work without impersonating Super Admin", async () => {
    const f = fixture(); const invitation = await f.service.createForProcurement(authority, command);
    expect(invitation.invitedBy.role).toBe("procurement"); expect(invitation.currentLinkAvailable).toBe(true);
    expect((await f.repository.pageUserInvitations({}, { limit: 10, offset: 0 }, NOW.toISOString())).items[0]?.currentLinkAvailable).toBe(true);
    await expect(f.service.accept({ rawToken: f.sends[0].rawToken, password: "StrongPassword!123" })).resolves.toEqual({ accepted: true });
    expect(await f.repository.findUserByEmail("vendor@example.test")).toMatchObject({ vendorId: "v-one", role: "vendor", active: true });
  });
  it("rechecks the active issuer at inspection and after password hashing", async () => {
    const f = fixture(); await f.service.createForProcurement(authority, command);
    const lookup = f.repository.findProcurementVendorInvitationSource;
    f.repository.findProcurementVendorInvitationSource = vi.fn(async () => null);
    await expect(f.service.inspect(f.sends[0].rawToken)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    f.repository.findProcurementVendorInvitationSource = lookup;
    const accepting = createUserInvitationService({ repository: f.repository, audit: createAuditService(f.repository), mailer: f.mailer, clock: () => NOW, passwordHasher: async () => { await f.repository.updateUser("issuer", 1, { active: false, updatedAt: NOW.toISOString() }); return "hash"; } });
    await expect(accepting.accept({ rawToken: f.sends[0].rawToken, password: "StrongPassword!123" })).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    expect(await f.repository.findUserByEmail("vendor@example.test")).toBeNull();
  });
  it("explicit resend rotates exactly one token and rejects stale expectations", async () => {
    const f = fixture(); const first = await f.service.createForProcurement(authority, command); f.advance();
    const next = await f.service.createForProcurement(authority, { commandId: "manual-request-two", resend: true, invitationId: first.id, expectedInvitationVersion: first.version });
    expect(f.sends).toHaveLength(2); expect(next.id).toBe(first.id);
    expect((await f.repository.findUserInvitationById(next.id))?.generationReceipt).toMatchObject({ sourceIntentId: authority.sourceIntentId, commandId: "manual-request-two", tokenGeneration: 2 });
    await expect(f.service.createForProcurement(authority, { commandId: "manual-request-three", resend: true, invitationId: first.id, expectedInvitationVersion: first.version })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(f.service.inspect(f.sends[0].rawToken)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    await expect(f.service.inspect(f.sends[1].rawToken)).resolves.toMatchObject({ role: "vendor" });
  });
  it("disabled mail preflights without token, invitation or audit", async () => {
    const f = fixture(); const randomBytes = vi.fn();
    const service = createUserInvitationService({ repository: f.repository, audit: createAuditService(f.repository), mailer: { deliveryKind: "disabled" }, clock: () => NOW, randomBytes });
    await expect(service.createForProcurement(authority, command)).rejects.toMatchObject({ code: "INVITATION_DELIVERY_UNAVAILABLE" });
    expect(randomBytes).not.toHaveBeenCalled(); expect((await f.repository.pageAuditEvents({}, { limit: 10, offset: 0 })).total).toBe(0);
  });
  it("rejects recipient/role/source injection and unpaired version expectations", () => {
    const valid = { expectedVendorVersion: 1, invitationId: null, expectedInvitationVersion: null, idempotencyKey: "command-one" };
    expect(vendorInvitationCommandSchema.safeParse(valid).success).toBe(true);
    for (const field of ["email", "role", "authority", "vendorId"]) expect(vendorInvitationCommandSchema.safeParse({ ...valid, [field]: "injected" }).success).toBe(false);
    expect(vendorInvitationCommandSchema.safeParse({ ...valid, invitationId: "invitation" }).success).toBe(false);
    expect(vendorOrderAccessCommandSchema.safeParse({ ...valid, action: "send_invitation", expectedOrderVersion: 1, expectedOrderRevision: 1, expectedAccessVersion: null }).success).toBe(true);
  });
});

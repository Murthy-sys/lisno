import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { migrateClientEmailProjectLinking } from "../src/migrations/client-email-project-linking.js";

const query = (value: unknown) => ({
  lean: () => ({ exec: vi.fn().mockResolvedValue(value) })
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client email project linking migration", () => {
  it("reports planned records without writing in dry-run mode", async () => {
    vi.spyOn(UserModel, "find").mockReturnValueOnce(query([
      { _id: "client-1", email: " Client@Example.COM ", mobile: null, address: null }
    ]) as never);
    vi.spyOn(ProjectModel, "find").mockReturnValueOnce(query([]) as never);
    const updateUsers = vi.spyOn(UserModel, "bulkWrite");
    const updateProjects = vi.spyOn(ProjectModel, "bulkWrite");

    await expect(migrateClientEmailProjectLinking({ dryRun: true })).resolves.toMatchObject({
      users: 1,
      projects: 0,
      duplicateEmails: []
    });
    expect(updateUsers).not.toHaveBeenCalled();
    expect(updateProjects).not.toHaveBeenCalled();
  });

  it("stops all writes when normalized emails collide", async () => {
    vi.spyOn(UserModel, "find").mockReturnValueOnce(query([
      { _id: "client-1", email: "Client@Example.COM", mobile: null, address: null },
      { _id: "client-2", email: " client@example.com ", mobile: null, address: null }
    ]) as never);
    vi.spyOn(ProjectModel, "find").mockReturnValueOnce(query([]) as never);
    const updateUsers = vi.spyOn(UserModel, "bulkWrite");
    const updateProjects = vi.spyOn(ProjectModel, "bulkWrite");

    await expect(migrateClientEmailProjectLinking()).rejects.toThrow("client@example.com");
    expect(updateUsers).not.toHaveBeenCalled();
    expect(updateProjects).not.toHaveBeenCalled();
  });

  it("preserves existing links and backfills empty legacy client snapshots", async () => {
    vi.spyOn(UserModel, "find").mockReturnValueOnce(query([
      {
        _id: "client-1",
        email: "Client@Example.COM",
        name: "Client One",
        mobile: null,
        address: undefined
      }
    ]) as never);
    vi.spyOn(ProjectModel, "find").mockReturnValueOnce(query([
      { _id: "project-linked", clientId: "client-1" }
    ]) as never);
    vi.spyOn(UserModel, "bulkWrite").mockResolvedValueOnce({} as never);
    const updateProjects = vi.spyOn(ProjectModel, "bulkWrite").mockResolvedValueOnce({} as never);
    vi.spyOn(UserModel, "syncIndexes").mockResolvedValueOnce([] as never);
    vi.spyOn(ProjectModel, "syncIndexes").mockResolvedValueOnce([] as never);

    await migrateClientEmailProjectLinking();

    expect(updateProjects).toHaveBeenCalledWith([
      expect.objectContaining({
        updateOne: expect.objectContaining({
          filter: { _id: "project-linked", clientId: "client-1" },
          update: expect.objectContaining({
            $set: expect.objectContaining({
              clientId: "client-1",
              clientMobile: "",
              clientAddress: ""
            })
          })
        })
      })
    ]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import {
  migrateClientEmailProjectLinking,
  runClientEmailProjectLinkingMigrationCommand
} from "../src/migrations/client-email-project-linking.js";

const query = (value: unknown) => ({
  lean: () => ({ exec: vi.fn().mockResolvedValue(value) })
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client email project linking migration", () => {
  it("disables automatic indexes and synchronizes them only after command backfill", async () => {
    const order: string[] = [];
    vi.spyOn(UserModel, "find").mockReturnValueOnce(
      query([
        {
          _id: "client-1",
          email: "Client@Example.COM",
          name: "Client One",
          mobile: null,
          address: null
        }
      ]) as never
    );
    vi.spyOn(ProjectModel, "find").mockReturnValueOnce(
      query([{ _id: "project-1", clientId: "client-1" }]) as never
    );
    vi.spyOn(UserModel, "bulkWrite").mockImplementationOnce(async () => {
      order.push("users-backfill");
      return {} as never;
    });
    vi.spyOn(ProjectModel, "bulkWrite").mockImplementationOnce(async () => {
      order.push("projects-backfill");
      return {} as never;
    });
    vi.spyOn(UserModel, "syncIndexes").mockImplementationOnce(async () => {
      order.push("users-indexes");
      return [] as never;
    });
    vi.spyOn(ProjectModel, "syncIndexes").mockImplementationOnce(async () => {
      order.push("projects-indexes");
      return [] as never;
    });
    const connect = vi.fn(async () => {
      order.push("connect");
      return undefined as never;
    });
    const disconnect = vi.fn(async () => {
      order.push("disconnect");
    });

    await runClientEmailProjectLinkingMigrationCommand({
      argv: [],
      loadEnvironment: () => ({ MONGODB_URI: "mongodb://migration.example/lisno" }),
      connect,
      disconnect,
      writeOutput: vi.fn()
    });

    expect(connect).toHaveBeenCalledWith(
      "mongodb://migration.example/lisno",
      { autoIndex: false }
    );
    expect(order).toEqual([
      "connect",
      "users-backfill",
      "projects-backfill",
      "users-indexes",
      "projects-indexes",
      "disconnect"
    ]);
  });

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

  it("rejects an invalid legacy user email before any write or index synchronization", async () => {
    vi.spyOn(UserModel, "find").mockReturnValueOnce(
      query([
        {
          _id: "client-invalid",
          email: "not-an-email",
          mobile: null,
          address: null
        }
      ]) as never
    );
    vi.spyOn(ProjectModel, "find").mockReturnValueOnce(query([]) as never);
    const updateUsers = vi
      .spyOn(UserModel, "bulkWrite")
      .mockResolvedValueOnce({} as never);
    const updateProjects = vi
      .spyOn(ProjectModel, "bulkWrite")
      .mockResolvedValueOnce({} as never);
    const syncUsers = vi
      .spyOn(UserModel, "syncIndexes")
      .mockResolvedValueOnce([] as never);
    const syncProjects = vi
      .spyOn(ProjectModel, "syncIndexes")
      .mockResolvedValueOnce([] as never);

    await expect(migrateClientEmailProjectLinking()).rejects.toThrow(
      "invalid user emails"
    );
    expect(updateUsers).not.toHaveBeenCalled();
    expect(updateProjects).not.toHaveBeenCalled();
    expect(syncUsers).not.toHaveBeenCalled();
    expect(syncProjects).not.toHaveBeenCalled();
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

    expect(updateProjects).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          updateOne: expect.objectContaining({
            filter: { _id: "project-linked", clientId: "client-1" },
            update: expect.objectContaining({
              $set: expect.objectContaining({
                clientMobile: "",
                clientAddress: ""
              })
            })
          })
        })
      ],
      { timestamps: false }
    );
  });

  it("does not rewrite migrated records or populated client snapshots on a second run", async () => {
    const firstPassUser = {
      _id: "client-1",
      email: "Client@Example.COM",
      name: "Current Client Name",
      mobile: "9999999999",
      address: "Current client address"
    };
    const firstPassProject = { _id: "project-linked", clientId: "client-1" };
    const migratedUser = {
      ...firstPassUser,
      emailNormalized: "client@example.com",
      updatedAt: new Date("2026-07-28T09:00:00.000Z")
    };
    const migratedProject = {
      _id: "project-linked",
      clientId: "client-1",
      clientName: "Original snapshot name",
      clientEmail: "original.snapshot@example.com",
      clientEmailNormalized: "original.snapshot@example.com",
      clientMobile: "1111111111",
      clientAddress: "Original snapshot address",
      updatedAt: new Date("2026-07-28T09:00:00.000Z")
    };
    const preservedProject = structuredClone(migratedProject);
    vi.spyOn(UserModel, "find")
      .mockReturnValueOnce(query([firstPassUser]) as never)
      .mockReturnValueOnce(query([migratedUser]) as never);
    vi.spyOn(ProjectModel, "find")
      .mockReturnValueOnce(query([firstPassProject]) as never)
      .mockReturnValueOnce(query([migratedProject]) as never);
    const updateUsers = vi.spyOn(UserModel, "bulkWrite").mockResolvedValue({} as never);
    const updateProjects = vi.spyOn(ProjectModel, "bulkWrite").mockResolvedValue({} as never);
    vi.spyOn(UserModel, "syncIndexes").mockResolvedValue([] as never);
    vi.spyOn(ProjectModel, "syncIndexes").mockResolvedValue([] as never);

    await migrateClientEmailProjectLinking();
    expect(updateUsers).toHaveBeenCalledOnce();
    expect(updateProjects).toHaveBeenCalledOnce();

    updateUsers.mockClear();
    updateProjects.mockClear();
    await migrateClientEmailProjectLinking();

    expect(updateUsers).not.toHaveBeenCalled();
    expect(updateProjects).not.toHaveBeenCalled();
    expect(migratedProject).toEqual(preservedProject);
  });
});

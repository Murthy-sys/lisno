import { describe, expect, it } from "vitest";
import { normalizeEmail } from "../src/domain/email.js";
import { calculateTaskRisk } from "../src/domain/risk.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { RepositoryConflictError } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

describe("memory repository", () => {
  it("normalizes account emails before identity lookup and project linking", async () => {
    const seed = structuredClone(demoSeedData);
    const client = seed.users.find((user) => user.id === "user-client-aurora")!;
    const projectA = seed.projects.find((project) => project.id === "project-aurora-villa")!;
    const projectB = structuredClone(projectA);
    projectA.id = "project-a";
    projectB.id = "project-b";
    projectB.name = "Aurora Loft";
    const alreadyLinked = structuredClone(projectA);
    alreadyLinked.id = "project-linked";
    alreadyLinked.clientId = "existing-client";
    seed.projects = [
      Object.assign(projectA, {
        clientId: null,
        clientEmail: "  John@Gmail.COM ",
        clientEmailNormalized: "john@gmail.com"
      }),
      Object.assign(projectB, {
        clientId: null,
        clientEmail: "JOHN@gmail.com",
        clientEmailNormalized: "john@gmail.com"
      }),
      alreadyLinked
    ] as typeof seed.projects;
    const repository = createMemoryRepository(seed);
    const clientRepository = repository as typeof repository & {
      linkUnclaimedProjectsToClient(
        emailNormalized: string,
        clientId: string,
        updatedAt: string
      ): Promise<Array<{ id: string }>>;
    };

    expect(normalizeEmail("  John@Gmail.COM ")).toBe("john@gmail.com");
    await expect(repository.findUserByEmail(" CLIENT@AURORA.EXAMPLE ")).resolves.toMatchObject({
      id: client.id
    });
    const linked = await clientRepository.linkUnclaimedProjectsToClient(
      "john@gmail.com",
      "client-john",
      "2026-07-28T09:00:00.000Z"
    );
    expect(linked.map((project) => project.id)).toEqual(["project-a", "project-b"]);
    await expect(repository.findProjectById("project-linked")).resolves.toMatchObject({
      clientId: "existing-client"
    });
  });

  it("pages active design managers by a case-insensitive email search", async () => {
    const repository = createMemoryRepository(demoSeedData) as ReturnType<
      typeof createMemoryRepository
    > & {
      pageActiveManagers(
        search: string,
        pagination: { limit: number; offset: number }
      ): Promise<{ items: Array<{ id: string; active: boolean; role: string }>; total: number }>;
    };

    await expect(
      repository.pageActiveManagers("AARAV@", { limit: 1, offset: 0 })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "user-manager-aarav",
          active: true,
          role: "design_manager"
        })
      ],
      total: 1
    });
  });

  it("rejects a second account whose email normalizes to an existing identity", async () => {
    const repository = createMemoryRepository(demoSeedData);

    await expect(
      repository.createUser({
        name: "Duplicate Aurora",
        email: " CLIENT@AURORA.EXAMPLE ",
        passwordHash: "hash",
        role: "client"
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("submits replacement drafts while preserving approved active section revisions", async () => {
    const seed = structuredClone(demoSeedData);
    seed.extractionJobs.push({
      id: "job-partial",
      designVersionId: "version-aurora-plan-1",
      status: "changes_requested",
      attemptCount: 1,
      queuedAt: "2026-07-27T09:00:00.000Z",
      startedAt: "2026-07-27T09:01:00.000Z",
      completedAt: "2026-07-27T09:02:00.000Z",
      leaseExpiresAt: null,
      failureCode: null,
      failureMessage: null,
      claimId: null,
      workerResultId: "result-partial",
      createdAt: "2026-07-27T09:00:00.000Z",
      updatedAt: "2026-07-27T09:02:00.000Z"
    });
    seed.designSections.push(
      {
        id: "section-approved",
        designVersionId: "version-aurora-plan-1",
        sourcePageId: "page-partial",
        label: "Approved",
        active: true,
        source: "ocr",
        ocrConfidence: 0.9,
        createdAt: "2026-07-27T09:00:00.000Z",
        updatedAt: "2026-07-27T09:00:00.000Z"
      },
      {
        id: "section-replacement",
        designVersionId: "version-aurora-plan-1",
        sourcePageId: "page-partial",
        label: "Replacement",
        active: true,
        source: "ocr",
        ocrConfidence: 0.8,
        createdAt: "2026-07-27T09:00:00.000Z",
        updatedAt: "2026-07-27T09:00:00.000Z"
      }
    );
    seed.designSectionRevisions.push(
      {
        id: "revision-approved",
        sectionId: "section-approved",
        revisionNumber: 1,
        sourcePageId: "page-partial",
        crop: { x: 0, y: 0, width: 1, height: 1 },
        croppedFileReference: "approved.png",
        label: "Approved",
        reviewStatus: "approved",
        submittedAt: "2026-07-27T09:01:00.000Z",
        reviewerId: "user-client-aurora",
        reviewedAt: "2026-07-27T09:02:00.000Z",
        rejectionComment: null,
        createdAt: "2026-07-27T09:00:00.000Z"
      },
      {
        id: "revision-replacement",
        sectionId: "section-replacement",
        revisionNumber: 2,
        sourcePageId: "page-partial",
        crop: { x: 0, y: 0, width: 1, height: 1 },
        croppedFileReference: "replacement.png",
        label: "Replacement",
        reviewStatus: "draft",
        submittedAt: null,
        reviewerId: null,
        reviewedAt: null,
        rejectionComment: null,
        createdAt: "2026-07-27T09:03:00.000Z"
      }
    );
    const repository = createMemoryRepository(seed);

    await expect(
      repository.submitDesignSectionDrafts(
        "version-aurora-plan-1",
        "2026-07-27T10:00:00.000Z"
      )
    ).resolves.toBe(1);
    await expect(repository.listSectionRevisions("section-approved")).resolves.toEqual([
      expect.objectContaining({ reviewStatus: "approved" })
    ]);
    await expect(repository.listSectionRevisions("section-replacement")).resolves.toEqual([
      expect.objectContaining({ reviewStatus: "submitted" })
    ]);
  });

  it("leases queued extraction jobs once and reclaims expired leases", async () => {
    const repository = createMemoryRepository(demoSeedData);

    const queued = await repository.enqueueExtractionJob({
      id: "job-1",
      designVersionId: "version-1",
      status: "queued",
      attemptCount: 0,
      queuedAt: "2026-07-27T10:00:00.000Z",
      startedAt: null,
      completedAt: null,
      leaseExpiresAt: null,
      failureCode: null,
      failureMessage: null
    });

    expect(
      (await repository.claimExtractionJob(
        "2026-07-27T10:01:00.000Z",
        "2026-07-27T10:06:00.000Z"
      ))?.id
    ).toBe(queued.id);
    expect(
      await repository.claimExtractionJob(
        "2026-07-27T10:02:00.000Z",
        "2026-07-27T10:07:00.000Z"
      )
    ).toBeNull();
    expect(
      (await repository.claimExtractionJob(
        "2026-07-27T10:07:00.000Z",
        "2026-07-27T10:12:00.000Z"
      ))?.attemptCount
    ).toBe(2);
  });

  it("replaces a worker draft idempotently without duplicating pages or sections", async () => {
    const repository = createMemoryRepository(demoSeedData);
    await repository.enqueueExtractionJob({
      id: "job-replacement",
      designVersionId: "version-1",
      status: "queued",
      attemptCount: 0,
      queuedAt: "2026-07-27T10:00:00.000Z",
      startedAt: null,
      completedAt: null,
      leaseExpiresAt: null,
      failureCode: null,
      failureMessage: null
    });
    const claim = await repository.claimExtractionJob(
      "2026-07-27T10:01:00.000Z",
      "2026-07-27T10:06:00.000Z"
    );
    const replacement = {
      jobId: "job-replacement",
      claimId: claim!.claimId,
      processedAt: "2026-07-27T10:02:00.000Z",
      designVersionId: "version-1",
      workerResultId: "result-1",
      sourcePages: [
        {
          id: "page-1",
          designVersionId: "version-1",
          pageNumber: 1,
          renderedFileReference: "generated/page-1.png",
          width: 1600,
          height: 900,
          createdAt: "2026-07-27T10:05:00.000Z",
          updatedAt: "2026-07-27T10:05:00.000Z"
        },
        {
          id: "page-2",
          designVersionId: "version-1",
          pageNumber: 2,
          renderedFileReference: "generated/page-2.png",
          width: 1600,
          height: 900,
          createdAt: "2026-07-27T10:05:00.000Z",
          updatedAt: "2026-07-27T10:05:00.000Z"
        }
      ],
      sections: [
        {
          section: {
            id: "section-1",
            designVersionId: "version-1",
            sourcePageId: "page-1",
            label: "Kitchen",
            active: true,
            source: "ocr" as const,
            ocrConfidence: 0.98,
            createdAt: "2026-07-27T10:05:00.000Z",
            updatedAt: "2026-07-27T10:05:00.000Z"
          },
          revision: {
            id: "revision-1",
            sectionId: "section-1",
            revisionNumber: 1,
            sourcePageId: "page-1",
            crop: { x: 100, y: 120, width: 400, height: 300 },
            croppedFileReference: "generated/section-1-r1.png",
            label: "Kitchen",
            reviewStatus: "draft" as const,
            submittedAt: null,
            reviewerId: null,
            reviewedAt: null,
            rejectionComment: null,
            createdAt: "2026-07-27T10:05:00.000Z"
          }
        },
        {
          section: {
            id: "section-2",
            designVersionId: "version-1",
            sourcePageId: "page-2",
            label: "Living Room",
            active: true,
            source: "ocr" as const,
            ocrConfidence: 0.91,
            createdAt: "2026-07-27T10:05:00.000Z",
            updatedAt: "2026-07-27T10:05:00.000Z"
          },
          revision: {
            id: "revision-2",
            sectionId: "section-2",
            revisionNumber: 1,
            sourcePageId: "page-2",
            crop: { x: 80, y: 100, width: 500, height: 320 },
            croppedFileReference: "generated/section-2-r1.png",
            label: "Living Room",
            reviewStatus: "draft" as const,
            submittedAt: null,
            reviewerId: null,
            reviewedAt: null,
            rejectionComment: null,
            createdAt: "2026-07-27T10:05:00.000Z"
          }
        }
      ]
    };

    await repository.replaceExtractionDraft(replacement);
    await repository.replaceExtractionDraft(replacement);

    const retry = structuredClone(replacement);
    retry.workerResultId = "result-2";
    retry.sections[0]!.section.label = "Kitchen revised";
    retry.sections[0]!.revision.label = "Kitchen revised";
    await repository.replaceExtractionDraft(retry);

    await expect(repository.listSourcePages("version-1")).resolves.toHaveLength(2);
    await expect(repository.listDesignSections("version-1")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "section-1", active: true }),
        expect.objectContaining({ id: "section-2", active: true })
      ])
    );
    await expect(repository.listDesignSections("version-1")).resolves.toHaveLength(2);
    await expect(repository.listDesignSections("version-1")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Kitchen revised" })])
    );
  });

  it("protects reviewed extraction drafts and rejects invalid worker proposals", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const queued = await repository.enqueueExtractionJob({
      id: "job-protected",
      designVersionId: "version-protected",
      status: "queued",
      attemptCount: 0,
      queuedAt: "2026-07-27T10:00:00.000Z",
      startedAt: null,
      completedAt: null,
      leaseExpiresAt: null,
      failureCode: null,
      failureMessage: null
    });
    const claim = await repository.claimExtractionJob(
      "2026-07-27T10:01:00.000Z",
      "2026-07-27T10:06:00.000Z"
    );
    const replacement = {
      jobId: queued.id,
      claimId: claim!.claimId,
      processedAt: "2026-07-27T10:02:00.000Z",
      designVersionId: queued.designVersionId,
      workerResultId: "result-protected",
      sourcePages: [
        {
          id: "page-protected",
          designVersionId: queued.designVersionId,
          pageNumber: 1,
          renderedFileReference: "generated/protected.png",
          width: 1000,
          height: 800,
          createdAt: "2026-07-27T10:02:00.000Z",
          updatedAt: "2026-07-27T10:02:00.000Z"
        }
      ],
      sections: [
        {
          section: {
            id: "section-protected",
            designVersionId: queued.designVersionId,
            sourcePageId: "page-protected",
            label: "Study",
            active: true,
            source: "ocr" as const,
            ocrConfidence: 0.95,
            createdAt: "2026-07-27T10:02:00.000Z",
            updatedAt: "2026-07-27T10:02:00.000Z"
          },
          revision: {
            id: "revision-protected",
            sectionId: "section-protected",
            revisionNumber: 1,
            sourcePageId: "page-protected",
            crop: { x: 1, y: 2, width: 300, height: 200 },
            croppedFileReference: "generated/study.png",
            label: "Study",
            reviewStatus: "draft" as const,
            submittedAt: null,
            reviewerId: null,
            reviewedAt: null,
            rejectionComment: null,
            createdAt: "2026-07-27T10:02:00.000Z"
          }
        }
      ]
    };

    await expect(
      repository.replaceExtractionDraft({
        ...structuredClone(replacement),
        sections: [
          {
            ...structuredClone(replacement.sections[0]!),
            section: { ...replacement.sections[0]!.section, active: false }
          }
        ]
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    await repository.replaceExtractionDraft(replacement);
    await repository.createSectionRevision({
      ...replacement.sections[0]!.revision,
      id: "revision-protected-submitted",
      revisionNumber: 2,
      reviewStatus: "submitted",
      submittedAt: "2026-07-27T10:03:00.000Z"
    });
    await expect(
      repository.replaceExtractionDraft({
        ...replacement,
        workerResultId: "result-protected-retry"
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("rejects stale job completion and edits after a section leaves draft review", async () => {
    const repository = createMemoryRepository(demoSeedData);
    await repository.enqueueExtractionJob({
      id: "job-stale",
      designVersionId: "version-stale",
      status: "queued",
      attemptCount: 0,
      queuedAt: "2026-07-27T10:00:00.000Z",
      startedAt: null,
      completedAt: null,
      leaseExpiresAt: null,
      failureCode: null,
      failureMessage: null
    });
    const firstClaim = await repository.claimExtractionJob(
      "2026-07-27T10:01:00.000Z",
      "2026-07-27T10:02:00.000Z"
    );
    const secondClaim = await repository.claimExtractionJob(
      "2026-07-27T10:03:00.000Z",
      "2026-07-27T10:04:00.000Z"
    );

    await expect(
      repository.completeExtractionJob(
        "job-stale",
        firstClaim!.claimId,
        "2026-07-27T10:03:00.000Z"
      )
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    await expect(
      repository.completeExtractionJob(
        "job-stale",
        secondClaim!.claimId,
        "2026-07-27T10:03:30.000Z"
      )
    ).resolves.toMatchObject({ status: "designer_review" });

    await repository.createManualSection({
      id: "section-locked",
      designVersionId: "version-stale",
      sourcePageId: "page-locked",
      label: "Locked",
      active: true,
      source: "manual",
      ocrConfidence: null,
      createdAt: "2026-07-27T10:00:00.000Z",
      updatedAt: "2026-07-27T10:00:00.000Z"
    });
    await repository.createSectionRevision({
      id: "revision-locked",
      sectionId: "section-locked",
      revisionNumber: 1,
      sourcePageId: "page-locked",
      crop: { x: 0, y: 0, width: 10, height: 10 },
      croppedFileReference: "locked.png",
      label: "Locked",
      reviewStatus: "submitted",
      submittedAt: "2026-07-27T10:01:00.000Z",
      reviewerId: null,
      reviewedAt: null,
      rejectionComment: null,
      createdAt: "2026-07-27T10:00:00.000Z"
    });
    await expect(
      repository.updateDraftSection("section-locked", { label: "Changed" })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("returns a deterministic manager-to-designer organization tree", async () => {
    const repository = createMemoryRepository(demoSeedData);

    const tree = await repository.getOrganizationTree();

    expect(tree.map((manager) => manager.name)).toEqual(["Aarav Mehta", "Meera Iyer"]);
    expect(tree[0]?.designers.map((designer) => designer.name)).toEqual([
      "Ananya Rao",
      "Kabir Shah"
    ]);
    expect(tree[1]?.designers.map((designer) => designer.name)).toEqual([
      "Ishita Sen",
      "Vikram Nair"
    ]);
  });

  it("isolates client projects while preserving staff visibility rules", async () => {
    const seed = structuredClone(demoSeedData);
    seed.projects.push({
      ...seed.projects[0],
      id: "project-unclaimed-aurora-email",
      clientId: null,
      clientEmail: "client@aurora.example",
      clientEmailNormalized: "client@aurora.example"
    });
    const repository = createMemoryRepository(seed);
    const client = await repository.findUserByEmail("client@aurora.example");
    const designer = await repository.findUserByEmail("ananya@lisno.example");
    const manager = await repository.findUserByEmail("aarav@lisno.example");
    const head = await repository.findUserByEmail("head@lisno.example");

    expect(client).not.toBeNull();
    expect(designer).not.toBeNull();
    expect(manager).not.toBeNull();
    expect(head).not.toBeNull();

    await expect(repository.listProjectsForUser(client!)).resolves.toMatchObject([
      { id: "project-aurora-studio", clientId: "user-client-aurora" },
      { id: "project-aurora-villa", clientId: "user-client-aurora" }
    ]);
    await expect(repository.listProjectsForUser(designer!)).resolves.toMatchObject([
      { id: "project-aurora-villa" },
      { id: "project-unclaimed-aurora-email" },
      { id: "project-celeste-office" }
    ]);
    await expect(repository.listProjectsForUser(manager!)).resolves.toMatchObject([
      { id: "project-aurora-studio" },
      { id: "project-aurora-villa" },
      { id: "project-unclaimed-aurora-email" }
    ]);
    await expect(repository.listProjectsForUser(head!)).resolves.toHaveLength(4);
  });

  it("slices paginated reads while retaining filtered totals", async () => {
    const seed = structuredClone(demoSeedData);
    seed.evaluations.push({
      ...structuredClone(seed.evaluations[0]!),
      id: "evaluation-kabir-june-revision",
      revisionOf: "evaluation-kabir-june",
      createdAt: "2026-07-02T09:00:00.000Z"
    });
    seed.auditEvents.push({
      ...structuredClone(seed.auditEvents[0]!),
      id: "audit-kabir-progress",
      actorId: "user-designer-kabir",
      entityId: "task-circulation",
      occurredAt: "2026-07-15T09:00:00.000Z",
      createdAt: "2026-07-15T09:00:00.000Z"
    });
    seed.taskEvents.push(
      {
        ...structuredClone(seed.taskEvents[0]!),
        id: "event-circulation-progress-1",
        taskId: "task-circulation",
        actorId: "user-designer-kabir",
        occurredAt: "2026-07-15T09:00:00.000Z",
        createdAt: "2026-07-15T09:00:00.000Z"
      },
      {
        ...structuredClone(seed.taskEvents[0]!),
        id: "event-circulation-progress-2",
        taskId: "task-circulation",
        actorId: "user-designer-kabir",
        occurredAt: "2026-07-16T09:00:00.000Z",
        createdAt: "2026-07-16T09:00:00.000Z"
      },
      {
        ...structuredClone(seed.taskEvents[0]!),
        id: "event-circulation-progress-offset",
        taskId: "task-circulation",
        actorId: "user-designer-kabir",
        occurredAt: "2026-08-01T01:00:00+05:30",
        createdAt: "2026-07-31T19:30:00.000Z"
      }
    );
    const repository = createMemoryRepository(seed);
    const client = await repository.findUserById("user-client-aurora");

    await expect(
      repository.pageProjectsForUser(client!, { limit: 1, offset: 1 })
    ).resolves.toMatchObject({
      items: [{ id: "project-aurora-villa" }],
      total: 2
    });
    await expect(
      repository.pageEvaluationsForSubject("user-designer-kabir", {
        limit: 1,
        offset: 1
      })
    ).resolves.toMatchObject({
      items: [{ id: "evaluation-kabir-june" }],
      total: 2
    });
    await expect(
      repository.pageAuditEvents(
        {
          visibleActorIds: ["user-designer-kabir"],
          visibleTaskIds: []
        },
        { limit: 1, offset: 0 }
      )
    ).resolves.toMatchObject({
      items: [{ id: "audit-kabir-progress" }],
      total: 1
    });
    await expect(
      repository.pageKpiTasksForPeriod(
        ["user-designer-kabir"],
        "2026-07-01T00:00:00.000Z",
        "2026-07-31T23:59:59.999Z",
        { limit: 1, offset: 1 }
      )
    ).resolves.toMatchObject({
      items: [{ id: "task-circulation" }],
      total: 2
    });
    await expect(
      repository.pageKpiTaskEventsForPeriod(
        "task-circulation",
        "user-designer-kabir",
        "2026-07-01T00:00:00.000Z",
        "2026-07-31T23:59:59.999Z",
        { limit: 1, offset: 2 }
      )
    ).resolves.toMatchObject({
      items: [{ id: "event-circulation-progress-offset" }],
      total: 3
    });
  });

  it("does not treat a manager-linked non-designer as a direct report", async () => {
    const seed = structuredClone(demoSeedData);
    const client = seed.users.find((user) => user.id === "user-client-celeste")!;
    client.managerId = "user-manager-aarav";
    seed.projects.push({
      ...structuredClone(seed.projects[0]!),
      id: "project-non-designer-assignment",
      name: "Non-designer assignment",
      managerId: "user-manager-meera",
      assignedDesignerIds: [client.id]
    });
    const repository = createMemoryRepository(seed);
    const manager = await repository.findUserById("user-manager-aarav");

    const visibleProjectIds = (await repository.listProjectsForUser(manager!)).map(
      (project) => project.id
    );

    expect(visibleProjectIds).not.toContain("project-non-designer-assignment");
  });

  it("returns floors, stages, and tasks in explicit order", async () => {
    const repository = createMemoryRepository(demoSeedData);

    const hierarchy = await repository.getProjectHierarchy("project-aurora-villa");

    expect(hierarchy?.floors.map((floor) => floor.name)).toEqual([
      "Ground Floor",
      "First Floor"
    ]);
    expect(hierarchy?.floors[0]?.stages.map((stage) => stage.type)).toEqual([
      "internal_kickoff",
      "client_kickoff",
      "key_collection",
      "site_measurement",
      "concept_mood_board",
      "floor_plan",
      "client_revisions",
      "final_approval",
      "design_handoff"
    ]);
    expect(hierarchy?.floors[0]?.stages[5]?.tasks.map((task) => task.title)).toEqual([
      "Draft furniture layout",
      "Validate circulation clearances"
    ]);
  });

  it("clones seed input and returns safe copies from reads", async () => {
    const mutableSeed = structuredClone(demoSeedData);
    const repository = createMemoryRepository(mutableSeed);
    mutableSeed.users[0]!.name = "Mutated outside";

    const firstRead = await repository.findUserById("user-head");
    expect(firstRead?.name).toBe("Devika Menon");

    firstRead!.name = "Mutated read";
    const hierarchy = await repository.getProjectHierarchy("project-aurora-villa");
    hierarchy!.floors[0]!.stages[5]!.tasks.splice(0);

    await expect(repository.findUserById("user-head")).resolves.toMatchObject({
      name: "Devika Menon"
    });
    const reread = await repository.getProjectHierarchy("project-aurora-villa");
    expect(reread?.floors[0]?.stages[5]?.tasks.map((item) => item.title)).toEqual([
      "Draft furniture layout",
      "Validate circulation clearances"
    ]);
  });

  it("updates tasks only at the expected version", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const original = await repository.findTaskById("task-circulation");

    const updated = await repository.updateTask("task-circulation", original!.version, {
      status: "in_progress",
      progress: 35,
      latestUpdateAt: "2026-07-15T09:30:00.000Z"
    });

    expect(updated).toMatchObject({ status: "in_progress", progress: 35, version: 2 });
    await expect(
      repository.updateTask("task-circulation", original!.version, { progress: 40 })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("rolls back every in-memory write when a transaction operation fails", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const original = await repository.findTaskById("task-circulation");

    await expect(
      repository.runInTransaction(async (transaction) => {
        await transaction.updateTask("task-circulation", original!.version, {
          progress: 45
        });
        await transaction.appendTaskEvent({
          taskId: "task-circulation",
          actorId: "user-designer-kabir",
          type: "progress_changed",
          occurredAt: "2026-07-16T09:30:00.000Z",
          from: { progress: 20 },
          to: { progress: 45 },
          note: null
        });
        throw new Error("simulated audit failure");
      })
    ).rejects.toThrow("simulated audit failure");

    await expect(repository.findTaskById("task-circulation")).resolves.toEqual(
      original
    );
    await expect(repository.listTaskEvents("task-circulation")).resolves.toEqual(
      []
    );
  });

  it("serializes overlapping memory transactions so rollback cannot erase another commit", async () => {
    const repository = createMemoryRepository(demoSeedData);
    let releaseFailure!: () => void;
    let failureStarted!: () => void;
    const failureGate = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    const started = new Promise<void>((resolve) => {
      failureStarted = resolve;
    });

    const failing = repository.runInTransaction(async () => {
      failureStarted();
      await failureGate;
      throw new Error("late transaction failure");
    });
    await started;
    const successful = repository.runInTransaction((transaction) =>
      transaction.updateTask("task-circulation", 1, { progress: 45 })
    );
    releaseFailure();

    await expect(failing).rejects.toThrow("late transaction failure");
    await expect(successful).resolves.toMatchObject({ progress: 45, version: 2 });
    await expect(repository.findTaskById("task-circulation")).resolves.toMatchObject({
      progress: 45,
      version: 2
    });
  });

  it("rejects nested memory transactions explicitly", async () => {
    const repository = createMemoryRepository(demoSeedData);

    await expect(
      repository.runInTransaction((transaction) =>
        transaction.runInTransaction(async () => "nested")
      )
    ).rejects.toThrow("Nested memory transactions are not supported.");
  });

  it("isolates a concurrent direct write from a failing memory transaction", async () => {
    const repository = createMemoryRepository(demoSeedData);
    let releaseFailure!: () => void;
    let failureStarted!: () => void;
    const failureGate = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    const started = new Promise<void>((resolve) => {
      failureStarted = resolve;
    });
    const failing = repository.runInTransaction(async () => {
      failureStarted();
      await failureGate;
      throw new Error("transaction failed");
    });
    await started;
    const directWrite = repository.updateTask("task-circulation", 1, {
      progress: 45
    });
    releaseFailure();

    await expect(failing).rejects.toThrow("transaction failed");
    await expect(directWrite).resolves.toMatchObject({ progress: 45, version: 2 });
    await expect(repository.findTaskById("task-circulation")).resolves.toMatchObject({
      progress: 45,
      version: 2
    });
  });

  it("does not expose uncommitted memory transaction state to ordinary reads", async () => {
    const repository = createMemoryRepository(demoSeedData);
    let releaseTransaction!: () => void;
    let mutationComplete!: () => void;
    const transactionGate = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    const mutated = new Promise<void>((resolve) => {
      mutationComplete = resolve;
    });
    const transaction = repository.runInTransaction(async (unit) => {
      await unit.updateTask("task-circulation", 1, { progress: 45 });
      mutationComplete();
      await transactionGate;
      throw new Error("rollback after observation window");
    });
    await mutated;
    const read = repository.findTaskById("task-circulation");
    await expect(read).resolves.toMatchObject({ progress: 20, version: 1 });
    releaseTransaction();

    await expect(transaction).rejects.toThrow("rollback after observation window");
  });

  it("keeps backdated task event time separate from repository mutation time", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const original = await repository.findTaskById("task-circulation");

    const updated = await repository.updateTask("task-circulation", original!.version, {
      progress: 25,
      latestUpdateAt: "2026-06-20T09:30:00.000Z"
    });

    expect(updated.latestUpdateAt).toBe("2026-06-20T09:30:00.000Z");
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(original!.updatedAt).getTime()
    );
  });

  it("appends task events without exposing mutable history", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const before = await repository.listTaskEvents("task-circulation");

    const appended = await repository.appendTaskEvent({
      id: "event-circulation-progress",
      taskId: "task-circulation",
      actorId: "user-designer-kabir",
      type: "progress_changed",
      occurredAt: "2026-07-15T09:30:00.000Z",
      from: { progress: 20 },
      to: { progress: 35 },
      note: "Clearance review underway"
    });

    expect(await repository.listTaskEvents("task-circulation")).toHaveLength(before.length + 1);
    appended.to.progress = 99;
    const reread = await repository.listTaskEvents("task-circulation");
    expect(reread.at(-1)?.to).toEqual({ progress: 35 });
  });

  it("accepts successive design versions for the same design target", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const versionOne = demoSeedData.designVersions[0]!;

    const versionTwo = await repository.createDesignVersion({
      ...structuredClone(versionOne),
      id: "version-aurora-plan-2",
      versionNumber: 2,
      originalFilename: "aurora-ground-plan-v2.pdf",
      storedFileReference: "seed/aurora-ground-plan-v2.pdf",
      uploadedAt: "2026-07-16T10:00:00.000Z",
      createdAt: "2026-07-16T10:00:00.000Z",
      updatedAt: "2026-07-16T10:00:00.000Z"
    });

    expect(versionTwo.versionNumber).toBe(2);
    await expect(
      repository.listDesignVersions("project-aurora-villa")
    ).resolves.toMatchObject([
      { id: "version-aurora-plan-1", versionNumber: 1 },
      { id: "version-aurora-plan-2", versionNumber: 2 }
    ]);
  });

  it("rejects a duplicate design-version target and version number", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const versionOne = demoSeedData.designVersions[0]!;

    await expect(
      repository.createDesignVersion({
        ...structuredClone(versionOne),
        id: "version-aurora-plan-duplicate",
        originalFilename: "duplicate-name.pdf",
        storedFileReference: "seed/duplicate-name.pdf"
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("returns one latest client-visible approval per project with approved/uploaded/id descending ties", async () => {
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const source = demoSeedData.designVersions[0]!;
    await repository.createDesignVersion({ ...structuredClone(source), id: "version-villa-earlier", versionNumber: 2, approvedAt: "2026-07-20T09:00:00.000Z", uploadedAt: "2026-07-20T08:00:00.000Z", createdAt: "2026-07-20T08:00:00.000Z", updatedAt: "2026-07-20T09:00:00.000Z" });
    await repository.createDesignVersion({ ...structuredClone(source), id: "version-villa-z-early", versionNumber: 3, approvedAt: "2026-07-21T09:00:00.000Z", uploadedAt: "2026-07-21T08:00:00.000Z", createdAt: "2026-07-21T08:00:00.000Z", updatedAt: "2026-07-21T09:00:00.000Z" });
    await repository.createDesignVersion({ ...structuredClone(source), id: "version-villa-a-later", versionNumber: 4, approvedAt: "2026-07-21T09:00:00.000Z", uploadedAt: "2026-07-21T10:00:00.000Z", createdAt: "2026-07-21T10:00:00.000Z", updatedAt: "2026-07-21T10:00:00.000Z" });
    await repository.createDesignVersion({ ...structuredClone(source), id: "version-villa-b-later", versionNumber: 5, approvedAt: "2026-07-21T09:00:00.000Z", uploadedAt: "2026-07-21T10:00:00.000Z", createdAt: "2026-07-21T10:00:00.000Z", updatedAt: "2026-07-21T10:00:00.000Z" });
    await repository.createDesignVersion({ ...structuredClone(source), id: "version-studio-visible", projectId: "project-aurora-studio", floorId: "floor-studio", stageId: "stage-studio", versionNumber: 1, approvedAt: "2026-07-22T09:00:00.000Z", uploadedAt: "2026-07-22T08:00:00.000Z", createdAt: "2026-07-22T08:00:00.000Z", updatedAt: "2026-07-22T09:00:00.000Z" });

    await expect(repository.listLatestClientVisibleDesignVersions(["project-aurora-villa", "project-aurora-studio", "project-missing"])).resolves.toMatchObject([
      { projectId: "project-aurora-studio", id: "version-studio-visible" },
      { projectId: "project-aurora-villa", id: "version-villa-b-later" }
    ]);
  });

  it("returns evaluation corrections newest first while preserving revision links", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const first = await repository.createEvaluation({
      id: "evaluation-ananya-july-1",
      subjectUserId: "user-designer-ananya",
      evaluatorUserId: "user-manager-aarav",
      evaluatorRole: "design_manager",
      periodStartAt: "2026-07-01T00:00:00.000Z",
      periodEndAt: "2026-07-31T23:59:59.999Z",
      score: 82,
      comments: "Strong delivery discipline",
      createdAt: "2026-08-01T09:00:00.000Z"
    });
    const correction = await repository.createEvaluation({
      id: "evaluation-ananya-july-2",
      subjectUserId: "user-designer-ananya",
      evaluatorUserId: "user-manager-aarav",
      evaluatorRole: "design_manager",
      periodStartAt: "2026-07-01T00:00:00.000Z",
      periodEndAt: "2026-07-31T23:59:59.999Z",
      score: 86,
      comments: "Corrected after final review",
      revisionOf: first.id,
      createdAt: "2026-08-02T09:00:00.000Z"
    });

    expect(await repository.listEvaluationsForSubject("user-designer-ananya")).toMatchObject([
      { id: correction.id, revisionOf: first.id },
      { id: first.id, revisionOf: null }
    ]);
  });

  it("creates append-only audit events in chronological order", async () => {
    const repository = createMemoryRepository(demoSeedData);

    const appended = await repository.appendAuditEvent({
      id: "audit-circulation-deadline",
      actorId: "user-manager-aarav",
      action: "task_deadline_revised",
      entityType: "task",
      entityId: "task-circulation",
      occurredAt: "2026-07-16T10:00:00.000Z",
      oldValues: { currentDeadlineAt: "2026-07-20T17:00:00.000Z" },
      newValues: { currentDeadlineAt: "2026-07-22T17:00:00.000Z" },
      reason: "Client requested a revised layout"
    });

    expect(appended.id).toBe("audit-circulation-deadline");
    const audit = await repository.listAuditEvents({ entityId: "task-circulation" });
    expect(audit.at(-1)).toMatchObject({
      action: "task_deadline_revised",
      reason: "Client requested a revised layout"
    });
  });

  it("seeds representative gray, green, yellow, and red task risks", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const tasks = await repository.listTasks({});
    const levels = tasks.map((task) =>
      calculateTaskRisk(task, new Date("2026-07-15T12:00:00.000Z")).level
    );

    expect(new Set(levels)).toEqual(new Set(["gray", "green", "yellow", "red"]));
  });
});

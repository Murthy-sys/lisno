import { randomUUID } from "node:crypto";

import sharp from "sharp";

import { ApiError } from "../middleware/errors.js";
import type {
  AppRepository,
  CropRect,
  DesignSectionRecord,
  DesignSectionRevisionRecord,
  DesignSourcePageRecord
} from "../repositories/types.js";
import type { FileStorage } from "../storage/storage.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { requireAccessibleProject, requireActor, type Clock } from "./workflow.js";

export interface DesignSectionService {
  listDrafts(actor: PublicUser, versionId: string): Promise<unknown>;
  add(actor: PublicUser, versionId: string, input: SectionEditInput): Promise<unknown>;
  edit(actor: PublicUser, sectionId: string, input: PatchSectionInput): Promise<unknown>;
  remove(actor: PublicUser, sectionId: string, version: number): Promise<unknown>;
  retry(actor: PublicUser, versionId: string): Promise<unknown>;
  submit(actor: PublicUser, versionId: string): Promise<unknown>;
  pageImage(actor: PublicUser, pageId: string): Promise<NodeJS.ReadableStream>;
  revisionImage(actor: PublicUser, revisionId: string): Promise<NodeJS.ReadableStream>;
}

export interface SectionEditInput {
  sourcePageId: string;
  label: string;
  crop: CropRect;
}

export interface PatchSectionInput {
  version: number;
  label?: string;
  crop?: CropRect;
}

export function createDesignSectionService(
  repository: AppRepository,
  audit: AuditService,
  storage: FileStorage,
  clock: Clock
): DesignSectionService {
  async function requireOwner(actor: PublicUser, versionId: string) {
    const user = await requireActor(repository, actor);
    const version = await repository.findDesignVersionById(versionId);
    if (!version || user.role !== "designer" || !version.taskId) notFound();
    const [task, project] = await Promise.all([
      repository.findTaskById(version.taskId),
      repository.findProjectById(version.projectId)
    ]);
    if (
      !task ||
      !project ||
      task.ownerId !== actor.id ||
      version.uploaderId !== actor.id ||
      !project.assignedDesignerIds.includes(actor.id)
    ) {
      notFound();
    }
    return version;
  }

  async function requireEditable(actor: PublicUser, versionId: string) {
    const version = await requireOwner(actor, versionId);
    const job = await repository.findExtractionJobByVersionId(version.id);
    if (!job || !["designer_review", "processing_failed", "changes_requested"].includes(job.status)) {
      throw new ApiError(409, "INVALID_EXTRACTION_STATE", "The extracted sections cannot be edited in their current state.");
    }
    return { version, job };
  }

  async function cropPage(page: DesignSourcePageRecord, crop: CropRect) {
    assertCrop(crop, page);
    try {
      const source = await storage.read(page.renderedFileReference);
      const data = await sharp(source)
        .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
        .png()
        .toBuffer();
      return await storage.saveGenerated({ data, extension: ".png" });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "FILE_STORAGE_ERROR", "The section image could not be generated.");
    }
  }

  async function pageForVersion(pageId: string, versionId: string) {
    const page = await repository.findSourcePageById(pageId);
    if (!page || page.designVersionId !== versionId) notFound();
    return page;
  }

  return {
    async listDrafts(actor, versionId) {
      const { job } = await requireEditable(actor, versionId);
      const [pages, sections] = await Promise.all([
        repository.listSourcePages(versionId),
        repository.listDesignSections(versionId)
      ]);
      return {
        extractionStatus: job.status,
        pages: pages.map(publicPage),
        sections: await Promise.all(
          sections.map(async (section) => {
            const revisions = await repository.listSectionRevisions(section.id);
            return publicSection(section, revisions.at(-1)!);
          })
        )
      };
    },

    async add(actor, versionId, input) {
      await requireEditable(actor, versionId);
      const page = await pageForVersion(input.sourcePageId, versionId);
      const label = normalizeLabel(input.label);
      const stored = await cropPage(page, input.crop);
      const occurredAt = clock().toISOString();
      try {
        const result = await repository.runInTransaction(async (transaction) => {
          const section: DesignSectionRecord = {
            id: randomUUID(),
            designVersionId: versionId,
            sourcePageId: page.id,
            label,
            active: true,
            source: "manual",
            ocrConfidence: null,
            createdAt: occurredAt,
            updatedAt: occurredAt
          };
          const revision = draftRevision(section, page, input.crop, stored.reference, 1, occurredAt);
          await transaction.createManualSection(section);
          await transaction.createSectionRevision(revision);
          await audit.append({
            actorId: actor.id,
            action: "design_section_created",
            entityType: "design_section",
            entityId: section.id,
            occurredAt,
            newValues: { designVersionId: versionId, sourcePageId: page.id, label }
          }, transaction);
          return publicSection(section, revision);
        });
        return result;
      } catch (error) {
        await storage.delete(stored.reference).catch(() => undefined);
        throw error;
      }
    },

    async edit(actor, sectionId, input) {
      const section = await repository.findDesignSectionById(sectionId);
      if (!section || !section.active) notFound();
      await requireEditable(actor, section.designVersionId);
      const revisions = await repository.listSectionRevisions(section.id);
      const latest = revisions.at(-1);
      if (!latest || (latest.reviewStatus !== "draft" && latest.reviewStatus !== "rejected")) conflict();
      if (latest.revisionNumber !== input.version) conflict();
      const page = await pageForVersion(latest.sourcePageId, section.designVersionId);
      const label = input.label === undefined ? section.label : normalizeLabel(input.label);
      const crop = input.crop ?? latest.crop;
      let generated: { reference: string } | null = null;
      if (input.crop) generated = await cropPage(page, crop);
      const occurredAt = clock().toISOString();
      const revision = draftRevision(
        section,
        page,
        crop,
        generated?.reference ?? latest.croppedFileReference,
        latest.revisionNumber + 1,
        occurredAt,
        label
      );
      try {
        const result = await repository.runInTransaction(async (transaction) => {
          await transaction.createSectionRevision(revision);
          await transaction.updateDraftSection(section.id, { label, sourcePageId: page.id });
          await audit.append({
            actorId: actor.id,
            action: latest.reviewStatus === "rejected"
              ? "design_section_replaced"
              : "design_section_edited",
            entityType: "design_section",
            entityId: section.id,
            occurredAt,
            oldValues: { label: section.label, crop: latest.crop, version: latest.revisionNumber },
            newValues: { label, crop, version: revision.revisionNumber }
          }, transaction);
          return publicSection({ ...section, label }, revision);
        });
        return result;
      } catch (error) {
        if (generated) await storage.delete(generated.reference).catch(() => undefined);
        throw error;
      }
    },

    async remove(actor, sectionId, version) {
      const section = await repository.findDesignSectionById(sectionId);
      if (!section || !section.active) notFound();
      await requireEditable(actor, section.designVersionId);
      const latest = (await repository.listSectionRevisions(section.id)).at(-1);
      if (!latest || latest.reviewStatus !== "draft" || latest.revisionNumber !== version) conflict();
      const occurredAt = clock().toISOString();
      await repository.runInTransaction(async (transaction) => {
        await transaction.updateDraftSection(section.id, { active: false });
        await audit.append({
          actorId: actor.id,
          action: "design_section_removed",
          entityType: "design_section",
          entityId: section.id,
          occurredAt,
          oldValues: { active: true },
          newValues: { active: false }
        }, transaction);
      });
      return { id: section.id, active: false };
    },

    async retry(actor, versionId) {
      const { job } = await requireEditable(actor, versionId);
      if (job.status !== "processing_failed") {
        throw new ApiError(409, "INVALID_EXTRACTION_STATE", "Only failed extraction can be retried.");
      }
      const occurredAt = clock().toISOString();
      const updated = await repository.runInTransaction(async (transaction) => {
        const result = await transaction.retryExtractionJob(job.id, occurredAt);
        await audit.append({
          actorId: actor.id,
          action: "design_extraction_retried",
          entityType: "design_version",
          entityId: versionId,
          occurredAt,
          oldValues: { status: job.status, failureCode: job.failureCode },
          newValues: { status: result.status }
        }, transaction);
        return result;
      });
      return { extractionStatus: updated.status };
    },

    async submit(actor, versionId) {
      const { job } = await requireEditable(actor, versionId);
      if (job.status !== "designer_review" && job.status !== "changes_requested") {
        throw new ApiError(409, "INVALID_EXTRACTION_STATE", "Sections are not ready to submit.");
      }
      const active = (await repository.listDesignSections(versionId)).filter((section) => section.active);
      if (active.length === 0) {
        throw new ApiError(400, "NO_ACTIVE_SECTIONS", "At least one active section is required.");
      }
      const occurredAt = clock().toISOString();
      const submittedCount = await repository.runInTransaction(async (transaction) => {
        const count = await transaction.submitDesignSectionDrafts(versionId, occurredAt);
        await audit.append({
          actorId: actor.id,
          action: "design_sections_submitted",
          entityType: "design_version",
          entityId: versionId,
          occurredAt,
          oldValues: { extractionStatus: job.status },
          newValues: { extractionStatus: "submitted", submittedCount: count }
        }, transaction);
        return count;
      });
      return { extractionStatus: "submitted", submittedCount };
    },

    async pageImage(actor, pageId) {
      const page = await repository.findSourcePageById(pageId);
      if (!page) notFound();
      const [version, job] = await Promise.all([
        repository.findDesignVersionById(page.designVersionId),
        repository.findExtractionJobByVersionId(page.designVersionId)
      ]);
      if (!version || !job) notFound();
      if (["submitted", "changes_requested", "approved"].includes(job.status)) {
        await requireAccessibleProject(repository, actor, version.projectId);
      } else {
        await requireOwner(actor, page.designVersionId);
      }
      return storage.open(page.renderedFileReference);
    },

    async revisionImage(actor, revisionId) {
      const revision = await repository.findSectionRevisionById(revisionId);
      if (!revision) notFound();
      const section = await repository.findDesignSectionById(revision.sectionId);
      if (!section) notFound();
      if (revision.reviewStatus === "draft") {
        await requireOwner(actor, section.designVersionId);
      } else {
        const version = await repository.findDesignVersionById(section.designVersionId);
        if (!version) notFound();
        await requireAccessibleProject(repository, actor, version.projectId);
      }
      return storage.open(revision.croppedFileReference);
    }
  };
}

function draftRevision(
  section: DesignSectionRecord,
  page: DesignSourcePageRecord,
  crop: CropRect,
  reference: string,
  revisionNumber: number,
  createdAt: string,
  label = section.label
): DesignSectionRevisionRecord {
  return {
    id: randomUUID(),
    sectionId: section.id,
    revisionNumber,
    sourcePageId: page.id,
    crop,
    croppedFileReference: reference,
    label,
    reviewStatus: "draft",
    submittedAt: null,
    reviewerId: null,
    reviewedAt: null,
    rejectionComment: null,
    createdAt
  };
}

function publicPage(page: DesignSourcePageRecord) {
  const { renderedFileReference: _private, ...visible } = page;
  return { ...visible, imageUrl: `/api/v1/design-source-pages/${page.id}/image` };
}

function publicSection(section: DesignSectionRecord, revision: DesignSectionRevisionRecord) {
  const { croppedFileReference: _private, ...visibleRevision } = revision;
  return {
    ...section,
    revision: {
      ...visibleRevision,
      imageReference: `/api/v1/design-section-revisions/${revision.id}/image`
    }
  };
}

function normalizeLabel(value: string) {
  const label = value.trim().replace(/\s+/g, " ");
  if (!label || label.length > 200) {
    throw new ApiError(400, "VALIDATION_ERROR", "The section label is invalid.", {
      label: "Enter a label between 1 and 200 characters."
    });
  }
  return label;
}

function assertCrop(crop: CropRect, page: DesignSourcePageRecord) {
  if (
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.x + crop.width > page.width ||
    crop.y + crop.height > page.height
  ) {
    throw new ApiError(400, "INVALID_CROP", "The crop must stay within the source page.", {
      crop: "Use integer coordinates within the source page bounds."
    });
  }
}

function conflict(): never {
  throw new ApiError(409, "STALE_SECTION_VERSION", "The section was changed. Refresh and try again.");
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}

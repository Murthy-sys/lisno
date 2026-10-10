import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AskLisnoResolution, AskLisnoResponse } from "../contracts/ask-lisno.js";
import type { ChatActor } from "../contracts/project-chat.js";
import type { AssistantFactBundle, AssistantReadScope, AssistantReadSources } from "../contracts/project-chat-assistant.js";
import { ASSISTANT_DEFAULTS as limits, AssistantFailure } from "../domain/project-chat-assistant.js";
import { ApiError } from "../middleware/errors.js";
import type { ChatTransaction, ProjectChatRepository } from "../repositories/project-chat.js";
import { acquireAssistantSlot, admitAssistant, admitAssistantProject, reserveAssistantTokens, settleAssistantTokens } from "./assistant-usage.js";
import { clarification, isSocialMessage, resolveProjectName, type ProjectName } from "./ask-lisno-project-resolution.js";
import { isProjectListRequest, orderedProjectList, PROJECT_LIST_PAGE_SIZE, projectListChanged, projectListPage } from "./ask-lisno-project-list.js";
import { readAssistantContext, sourceWitness } from "./project-assistant-context.js";
import type { AssistantProvider } from "./project-assistant-provider.js";
import { createAssistantReadSources } from "./project-assistant-sources.js";

const projectIdSchema = z.string().trim().min(1).max(200).nullable();
export const askLisnoSchema = z.object({
  projectId: projectIdSchema,
  contextProjectId: projectIdSchema.optional(),
  choiceProjectId: projectIdSchema.optional(),
  projectListPage: z.object({
    offset: z.number().int().min(0).max(1_000_000).multipleOf(PROJECT_LIST_PAGE_SIZE),
    version: z.string().regex(/^[a-f0-9]{64}$/)
  }).strict().optional(),
  message: z.string().trim().min(1).max(2_000),
  history: z.array(z.object({body: z.string().trim().min(1).max(2_000), projectId: projectIdSchema.optional()}).strict()).max(15)
}).strict();

export function createAskLisnoService(options: {
  chatRepository: ProjectChatRepository; enabled: boolean; provider: AssistantProvider;
  clock?: () => Date; tokensPerDay?: number;
  readSources?: (scope: AssistantReadScope) => AssistantReadSources;
}) {
  const clock = options.clock ?? (() => new Date());
  return { async request(actor: ChatActor, raw: unknown): Promise<AskLisnoResponse> {
    const parsed = askLisnoSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Please provide a message and valid project context.");
    const input = parsed.data;
    const listingProjects = isProjectListRequest(input.message);
    if (input.projectListPage && !listingProjects) throw new ApiError(400, "VALIDATION_ERROR", "Project-list pages require a project-list request.");
    // A bare yes/no without conversational context is not project consent. Let
    // the provider ask a natural clarification without selecting a project.
    const socialOnly = isSocialMessage(input.message) || (!input.history.length && /^(?:yes|no)[.!?\s]*$/i.test(input.message));
    const scope = (projectId: string): AssistantReadScope => ({projectId, clientId: actor.id, sessionVersion: actor.sessionVersion});
    const authorize = async (transaction?: ChatTransaction) => {
      if (actor.role !== "client") throw new ApiError(403, "FORBIDDEN", "Ask Lisno is available to Clients.");
      if (actor.expiresAt <= Math.floor(clock().getTime() / 1000)) throw new ApiError(401, "SESSION_EXPIRED", "Please sign in again.");
      const read = async (tx: ChatTransaction) => {
        const user = await tx.app.findUserById(actor.id);
        if (!user || !user.active || user.role !== "client" || user.sessionVersion !== actor.sessionVersion) throw new ApiError(401, "SESSION_EXPIRED", "Please sign in again.");
        return user;
      };
      return transaction ? read(transaction) : options.chatRepository.snapshot(read);
    };
    await authorize();
    // Explicit IDs remain untrusted, including old page hints and inline choices.
    for (const id of new Set([input.projectId, input.contextProjectId, input.choiceProjectId].filter((id): id is string => Boolean(id)))) {
      await readAssistantContext(options.chatRepository, scope(id));
    }
    if (!options.enabled) throw new ApiError(503, "ASSISTANT_UNAVAILABLE", "Ask Lisno is currently unavailable. Please contact your project team.");
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > limits.maxPayloadBytes) throw new ApiError(400, "ASSISTANT_CONTEXT_LIMIT", "This conversation is too long. Please start a new question.");
    const release = acquireAssistantSlot();
    if (!release) throw new ApiError(429, "ASSISTANT_BUSY", "Ask Lisno is busy. Please try again shortly.");
    try {
      const requestId = randomUUID(), signal = AbortSignal.timeout(limits.generationMs);
      const startedAt = clock().getTime();
      let attempts = 0, admittedProjectId: string | null = null;
      let activeSources: AssistantReadSources | null = null;
      let sourceAdmission: Promise<AssistantReadSources> | null = null;
      let resolution: AskLisnoResolution = {state: "account", project: null, question: null, choices: []};
      const messages: Array<{id: string; body: string}> = [];
      const checkTime = () => { if (signal.aborted || clock().getTime() - startedAt >= limits.generationMs) throw new AssistantFailure("ASSISTANT_TIMEOUT"); };
      await options.chatRepository.mutate(async tx => {
        await authorize(tx);
        if (!(await admitAssistant(tx.assistant, {clientId: actor.id, projectId: null, now: clock().toISOString()}))) throw new AssistantFailure("ASSISTANT_ADMISSION_LIMIT");
      });
      const discover = async (authorizedOnly = false) => options.chatRepository.snapshot(async tx => {
        const projects: ProjectName[] = [];
        let offset = 0, expectedTotal: number | null = null;
        // Page the current Client scope within the request deadline. Keep only name
        // metadata locally, and scan every page so later duplicate names are found.
        while (true) {
          checkTime();
          const user = await authorize(tx);
          const page = await tx.app.pageProjectsForUserInModule(user, "projects", {limit: 100, offset});
          checkTime();
          if (expectedTotal !== null && page.total !== expectedTotal) throw new AssistantFailure("ASSISTANT_SOURCE_CHANGED");
          expectedTotal = page.total;
          for (const project of page.items) {
            if (project.clientId !== actor.id) continue;
            if (!authorizedOnly) projects.push({id: project.id, name: project.name, detail: project.location || null});
            else {
              checkTime();
              try {
                const current = await readAssistantContext(options.chatRepository, scope(project.id), tx);
                projects.push({id: project.id, name: current.sources.project.name, detail: current.sources.project.location || null});
              } catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
            }
          }
          offset += page.items.length;
          if (offset >= page.total) break;
          if (!page.items.length) throw new AssistantFailure("ASSISTANT_SOURCE_CHANGED");
        }
        for (const id of new Set((authorizedOnly ? [] : [input.projectId, input.contextProjectId, input.choiceProjectId]).filter((id): id is string => Boolean(id)))) {
          const context = await readAssistantContext(options.chatRepository, scope(id), tx);
          if (!projects.some(project => project.id === id)) projects.push({id, name: context.sources.project.name, detail: context.sources.project.location || null});
        }
        return {projects, complete: true};
      });
      if (listingProjects) {
        const discovered = await discover(true);
        const list = projectListPage(actor, orderedProjectList(discovered.projects), input.projectListPage);
        // Discovery is snapshot-consistent. Recheck this page in a fresh snapshot
        // before delivery so ownership or names changed during discovery fail closed.
        await options.chatRepository.snapshot(async tx => {
          await authorize(tx);
          for (const row of list.items) {
            checkTime();
            try {
              const current = await readAssistantContext(options.chatRepository, scope(row.id), tx);
              if (current.sources.project.name !== row.name || (current.sources.project.location || null) !== row.detail) projectListChanged();
            } catch (error) {
              if (error instanceof ApiError && error.status === 404) projectListChanged();
              throw error;
            }
          }
          await authorize(tx); checkTime();
        });
        const introduction = list.items.length ? "Here are your projects. Select one to view its progress or ask a question." : "You don't have any accessible projects yet. Please contact your Lisno team for help.";
        return {projectId: null, resolution, projectList: list, checkedAt: clock().toISOString(),
          answer: {kind: "status", facts: [], candidates: [], missingInputs: [], commercial: null, narrative: [{text: introduction, factIds: []}]}};
      }
      const updateHistory = () => {
        const current = resolution.project?.id ?? null;
        const history = input.history.filter((row, index) => {
          // The last unanswered clarification is untrusted Client text, never project evidence.
          // Keep its intent even when the popup carries a different page hint.
          if (row.projectId !== undefined) return row.projectId === current || (row.projectId === null && current !== null && index === input.history.length - 1);
          // Compatibility for older callers: unlabelled history belongs only to their explicit scope.
          return (input.projectId ?? null) === current && input.contextProjectId === undefined;
        });
        messages.splice(0, messages.length, ...history.map((row, index) => ({id: `context-${index}`, body: row.body})), {id: "question", body: input.message});
      };
      const resolveProject = async ({name}: {name: string | null}): Promise<AskLisnoResolution> => {
        checkTime();
        const discovered = await discover();
        let next = resolveProjectName({message: input.message, projects: discovered.projects, complete: discovered.complete,
          modelName: name, contextProjectId: input.contextProjectId, pageProjectId: input.projectId, choiceProjectId: input.choiceProjectId});
        if (next.project) {
          await readAssistantContext(options.chatRepository, scope(next.project.id));
          // A provider cannot combine reads from different projects in one answer.
          if (admittedProjectId && admittedProjectId !== next.project.id) throw new AssistantFailure("ASSISTANT_SOURCE_CHANGED");
        } else if (admittedProjectId) throw new AssistantFailure("ASSISTANT_SOURCE_CHANGED");
        const choices: ProjectName[] = [];
        for (const choice of next.choices) {
          try {
            const current = await readAssistantContext(options.chatRepository, scope(choice.id));
            choices.push({id: choice.id, name: current.sources.project.name, detail: current.sources.project.location || null});
          } catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
        }
        next = {...next, choices};
        resolution = next;
        updateHistory();
        return resolution;
      };
      if (socialOnly) updateHistory();
      else await resolveProject({name: null});
      const getSources = async () => {
        checkTime(); await authorize();
        const id = resolution.project?.id;
        if (!id) throw new AssistantFailure("ASSISTANT_PROJECT_REQUIRED");
        await readAssistantContext(options.chatRepository, scope(id));
        return sourceAdmission ??= (async () => {
          if (!admittedProjectId) {
            await options.chatRepository.mutate(async tx => {
              await authorize(tx); await readAssistantContext(options.chatRepository, scope(id), tx);
              if (!(await admitAssistantProject(tx.assistant, {projectId: id, now: clock().toISOString()}))) throw new AssistantFailure("ASSISTANT_ADMISSION_LIMIT");
            });
            admittedProjectId = id;
          }
          if (resolution.project?.id !== id) throw new AssistantFailure("ASSISTANT_SOURCE_CHANGED");
          return activeSources ??= options.readSources?.(scope(id)) ?? createAssistantReadSources({chatRepository: options.chatRepository, scope: scope(id), clock});
        })();
      };
      const sources: AssistantReadSources = {
        status: async () => (await getSources()).status(),
        execution: async () => (await getSources()).execution(),
        searchCatalogue: async input => (await getSources()).searchCatalogue(input),
        recommendations: async input => (await getSources()).recommendations(input),
        preview: async input => (await getSources()).preview(input),
        revalidate: async freshness => resolution.project ? (await getSources()).revalidate(freshness) : freshness.length === 0
      };
      const profileValue = (user: Awaited<ReturnType<typeof authorize>>) => ({name: user.name, email: user.email, mobile: user.mobile});
      const profile = async (): Promise<AssistantFactBundle> => {
        const user = profileValue(await authorize());
        const facts = [
          {id: "profile:name", label: "Your name", value: user.name},
          {id: "profile:email", label: "Your account email", value: user.email},
          ...(user.mobile ? [{id: "profile:mobile", label: "Your account phone", value: user.mobile}] : []),
          {id: "support:projects", label: "Your projects", value: "You can ask about a project by name. If no projects are available, contact your Lisno team."},
          {id: "support:team", label: "Contact your team", value: "Open Project messages to contact your project team. Your private Ask Lisno question is not sent to them."},
          ...(!resolution.project ? [{id: "support:select-project", label: "Project information", value: "Tell me the project name to check its status, timeline, progress, or estimate."}] : [])
        ];
        return {facts: facts.map(fact => ({...fact, source: {id: actor.id, label: "Your account", href: null}})), freshness: [sourceWitness("ask-lisno-profile", actor.id, user)]};
      };
      const generated = await options.provider.generate({messages, sources, ...(!socialOnly ? {profile, resolveProject} : {}), projectAvailable: () => resolution.state === "resolved", signal,
        reserveAttempt: async bytes => {
          checkTime();
          if (attempts >= limits.maxProviderAttempts) throw new AssistantFailure("ASSISTANT_RETRY_LIMIT");
          const attempt = ++attempts;
          return options.chatRepository.mutate(async tx => {
            await authorize(tx);
            if (resolution.project) await readAssistantContext(options.chatRepository, scope(resolution.project.id), tx);
            return reserveAssistantTokens(tx.assistant, {requestId, attempt, projectId: resolution.project?.id ?? null, bytes, now: clock().toISOString(), tokensPerDay: options.tokensPerDay});
          });
        },
        settleAttempt: (id, usage) => options.chatRepository.mutate(tx => settleAssistantTokens(tx.assistant, id, usage, clock().toISOString()))
      });
      checkTime();
      const currentProfile = profileValue(await authorize());
      const profileVersion = sourceWitness("ask-lisno-profile", actor.id, currentProfile);
      if (generated.freshness.some(source => source.kind === "ask-lisno-profile" && (source.id !== actor.id || source.version !== profileVersion.version))) throw new AssistantFailure("ASSISTANT_SOURCE_CHANGED");
      if (!(await sources.revalidate(generated.freshness.filter(source => source.kind !== "ask-lisno-profile")))) throw new AssistantFailure("ASSISTANT_SOURCE_CHANGED");
      if (resolution.project) {
        const current = await readAssistantContext(options.chatRepository, scope(resolution.project.id));
        if (current.sources.project.name !== resolution.project.name) throw new AssistantFailure("ASSISTANT_SOURCE_CHANGED");
      }
      const currentChoices: ProjectName[] = [];
      for (const choice of resolution.choices) {
        try {
          const context = await readAssistantContext(options.chatRepository, scope(choice.id));
          currentChoices.push({id: choice.id, name: context.sources.project.name, detail: context.sources.project.location || null});
        } catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
      }
      await authorize(); checkTime();
      const {freshness: _freshness, ...answer} = generated;
      if (resolution.state === "clarification") {
        resolution = {...clarification(resolution.question!, currentChoices)};
        return {projectId: null, resolution, checkedAt: clock().toISOString(), answer: {kind: "clarification", facts: [], candidates: [], missingInputs: [], commercial: null, narrative: [{text: resolution.question!, factIds: []}]}};
      }
      return {projectId: resolution.project?.id ?? null, resolution, checkedAt: clock().toISOString(), answer};
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const code = error instanceof AssistantFailure ? error.code : "ASSISTANT_UNAVAILABLE";
      const limited = ["ASSISTANT_ADMISSION_LIMIT", "ASSISTANT_TOKEN_LIMIT", "ASSISTANT_RATE_LIMIT"].includes(code);
      throw new ApiError(limited ? 429 : 503, code, limited ? "Ask Lisno has reached its usage limit. Please try again later." : "Ask Lisno could not answer this time. Please try again or contact your project team.");
    } finally { release(); }
  }};
}
export type AskLisnoService = ReturnType<typeof createAskLisnoService>;

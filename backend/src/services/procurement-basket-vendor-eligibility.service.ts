import type { ClientSession } from "mongoose";

import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProcurementVendorCityModel } from "../models/ProcurementVendorCity.js";
import { ProjectModel } from "../models/Project.js";
import { storedProcurementVendorProfile } from "./procurement-vendor-profile.js";
import { vendorKpiDirectorySummaries } from "./vendor-kpi.service.js";
import { vendorActivations } from "./vendor-readiness.service.js";

type Row = Record<string, any>;
export type VendorCityMatch = "same_city" | "outside_city" | "unknown";
export type VendorCityFilter = "all" | VendorCityMatch;
export interface BasketVendorCandidate {
  vendorId: string;
  code: string;
  name: string;
  contactEmail: string | null;
  kpiScoreBps: number | null;
  city: { name: string; key: string } | null;
  cityVersion: number;
  cityMatch: VendorCityMatch;
  eligible: boolean;
  blockers: string[];
}
export interface BasketVendorCandidatePage {
  projectCity: { name: string; key: string } | null;
  items: BasketVendorCandidate[];
  matchingVendorCount: number;
  blockedReasonCounts: Record<string, number>;
  total: number;
  limit: number;
  offset: number;
}
export interface BasketVendorCandidateQuery {
  q?: string;
  city?: VendorCityFilter;
  limit?: number;
  offset?: number;
}

function basketClassificationMatches(vendor: Row, basketId: string): boolean {
  const profile = vendor.procurementProfile as Row | null | undefined;
  if (!profile) return false;
  const savedIds = Array.isArray(profile.mainBasketIds)
    ? profile.mainBasketIds.filter((value: unknown): value is string => typeof value === "string") : [];
  return savedIds.length ? savedIds.includes(basketId) : profile.mainBasketId === basketId;
}

function cityOf(row: Row | null | undefined): { name: string; key: string } | null {
  return row && typeof row.cityName === "string" && typeof row.cityKey === "string"
    ? { name: row.cityName, key: row.cityKey } : null;
}

function matchCity(projectCity: { name: string; key: string } | null, vendorCity: { name: string; key: string } | null): VendorCityMatch {
  if (!projectCity || !vendorCity) return "unknown";
  return projectCity.key === vendorCity.key ? "same_city" : "outside_city";
}

async function candidateRows(vendors: Row[], projectCity: { name: string; key: string } | null, session?: ClientSession): Promise<BasketVendorCandidate[]> {
  if (!vendors.length) return [];
  const cityQuery = ProcurementVendorCityModel.find({ _id: { $in: vendors.map((vendor) => String(vendor._id)) } });
  if (session) cityQuery.session(session);
  const cities = await cityQuery.lean().exec() as Row[];
  const cityByVendor = new Map(cities.map((row) => [String(row._id), row]));
  const activationByVendor = await vendorActivations(vendors, session);
  const kpiByVendor = await vendorKpiDirectorySummaries(vendors, session);
  return vendors.map((vendor) => {
    const vendorId = String(vendor._id);
    const profile = storedProcurementVendorProfile(vendor.procurementProfile);
    const contactEmail = typeof profile?.email === "string" && profile.email.trim() ? profile.email.trim() : null;
    const kpi = kpiByVendor.get(vendorId);
    const activation = activationByVendor.get(vendorId);
    const blockers: string[] = [];
    if (activation?.effectiveStatus !== "active") blockers.push(activation?.effectiveStatus === "inactive" ? "vendor_inactive" : activation?.effectiveStatus === "archived" ? "vendor_archived" : "vendor_under_review");
    if (kpi?.status !== "rated" || kpi.officialScoreBps == null) blockers.push("kpi_unrated");
    if (!contactEmail) blockers.push("contact_missing");
    const cityRow = cityByVendor.get(vendorId) ?? null;
    const city = cityOf(cityRow);
    return {
      vendorId, code: String(vendor.code), name: String(vendor.name), contactEmail,
      kpiScoreBps: kpi?.status === "rated" ? kpi.officialScoreBps : null,
      city, cityVersion: Number(cityRow?.version ?? 0), cityMatch: matchCity(projectCity, city), eligible: blockers.length === 0, blockers
    };
  });
}

function vendorFilter(basketId: string, q: string) {
  const literal = q.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return {
    $and: [
      { $or: [{ "procurementProfile.mainBasketIds": basketId }, { "procurementProfile.mainBasketId": basketId }] },
      ...(q ? [{ $or: [{ name: { $regex: literal, $options: "i" } }, { code: { $regex: literal, $options: "i" } }] }] : [])
    ]
  };
}

/** Staff-only picker. City is a discovery filter, never an access or price decision. */
export async function readBasketVendorCandidates(projectId: string, basketId: string, session?: ClientSession, query: BasketVendorCandidateQuery = {}): Promise<BasketVendorCandidatePage> {
  const projectQuery = ProjectModel.findById(projectId).select({ cityName: 1, cityKey: 1 });
  if (session) projectQuery.session(session);
  const project = await projectQuery.lean().exec() as Row | null;
  if (!project) throw new ApiError(404, "NOT_FOUND", "The requested project was not found.");
  const projectCity = cityOf(project);
  const limit = query.limit ?? 25;
  const offset = query.offset ?? 0;
  const cityFilter = query.city ?? "all";
  const baseFilter = vendorFilter(basketId, query.q?.trim() ?? "");
  const items: BasketVendorCandidate[] = [];
  const blockedReasonCounts: Record<string, number> = {};
  let matchingVendorCount = 0;
  let total = 0;
  let after: { name: string; id: string } | null = null;
  const batchSize = 100;

  // Activation and KPI live in separate collections, so page only after evaluating
  // each basket match. Keyset batches avoid loading the whole vendor directory at once.
  while (true) {
    const filter = after ? { $and: [baseFilter, { $or: [
      { nameNormalized: { $gt: after.name } },
      { nameNormalized: after.name, _id: { $gt: after.id } }
    ] }] } : baseFilter;
    const vendorsQuery = AiEstimatorKnowledgeVendorModel.find(filter)
      .select({ _id: 1, code: 1, name: 1, nameNormalized: 1, status: 1,
        procurementProfile: 1, kpiRubricGeneration: 1, msmeCertificate: 1 })
      .sort({ nameNormalized: 1, _id: 1 }).limit(batchSize);
    if (session) vendorsQuery.session(session);
    const vendors = await vendorsQuery.lean().exec() as Row[];
    if (!vendors.length) break;
    const last = vendors[vendors.length - 1]!;
    after = { name: String(last.nameNormalized), id: String(last._id) };
    for (const candidate of await candidateRows(vendors.filter(vendor => basketClassificationMatches(vendor, basketId)),
      projectCity, session)) {
      if (cityFilter !== "all" && candidate.cityMatch !== cityFilter) continue;
      matchingVendorCount += 1;
      if (!candidate.eligible) {
        for (const blocker of candidate.blockers) {
          blockedReasonCounts[blocker] = (blockedReasonCounts[blocker] ?? 0) + 1;
        }
        continue;
      }
      if (total >= offset && items.length < limit) items.push(candidate);
      total += 1;
    }
    if (vendors.length < batchSize) break;
  }
  return { projectCity, items, matchingVendorCount, blockedReasonCounts, total, limit, offset };
}

/** Resolve basket-wide selection independently from picker search, city filter, and page. */
export async function eligibleBasketVendors(projectId: string, basketId: string,
  session: ClientSession): Promise<BasketVendorCandidate[]> {
  const selected: BasketVendorCandidate[] = [];
  const pageSize = 100;
  let offset = 0;
  while (true) {
    const page = await readBasketVendorCandidates(projectId, basketId, session, { offset, limit: pageSize });
    selected.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total) return selected;
    if (page.items.length === 0) throw new ApiError(409, "PROCUREMENT_VENDOR_SELECTION_CHANGED", "Eligible vendors changed. Reload before sending.");
  }
}

/** Called again at invite and award; never trust a picker snapshot. */
export async function assertBasketVendorEligible(vendorId: string, projectId: string, basketId: string, session: ClientSession): Promise<BasketVendorCandidate> {
  const project = await ProjectModel.findById(projectId).select({ cityName: 1, cityKey: 1 }).session(session).lean().exec() as Row | null;
  if (!project) throw new ApiError(404, "NOT_FOUND", "The requested project was not found.");
  const vendor = await AiEstimatorKnowledgeVendorModel.findById(vendorId).session(session).lean().exec() as Row | null;
  if (!vendor || !basketClassificationMatches(vendor, basketId)) throw new ApiError(409, "PROCUREMENT_VENDOR_BASKET_MISMATCH", "The vendor is not classified for this main basket.");
  const [candidate] = await candidateRows([vendor], cityOf(project), session);
  if (!candidate?.eligible) throw new ApiError(409, "PROCUREMENT_VENDOR_NOT_ELIGIBLE", "The vendor is not ready for this enquiry.");
  return candidate;
}

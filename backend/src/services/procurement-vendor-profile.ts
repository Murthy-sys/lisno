import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { z } from "zod";
import type { ClientSession } from "mongoose";
import type { ProcurementVendorStoredProfile, ProcurementVendorSummary, ProcurementVendorPhotoDescriptor } from "../contracts/procurement-vendor.js";
import { VENDOR_ORGANIZATION_TYPES } from "../contracts/procurement-vendor.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";

const shortText = z.string().trim().min(1).max(240);
const longText = z.string().trim().min(1).max(4_000);
const money = z.number().int().min(0).max(MAX_FINANCE_AMOUNT_PAISE);
const executionType = z.enum(["labor", "material_labour"]);
const executionTypes = z.union([executionType, z.array(executionType).min(1).max(2)
  .refine(value => new Set(value).size === value.length, "Choose each Execution Type only once.")])
  .transform(value => (typeof value === "string" ? [value] : [...value]).sort()).nullable();
export const PROCUREMENT_VENDOR_GST_NUMBER_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/u;
const bankAccountSchema = z.object({
  accountHolderName: shortText,
  bankName: shortText,
  accountNumber: z.string().trim().regex(/^[0-9]{1,34}$/u, "Enter an account number with 1 to 34 digits."),
  ifscCode: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/u, "Enter a valid 11-character IFSC Code."),
  branchName: z.string().trim().max(240).nullable().optional().transform(value => value || null)
}).strict();
const basketIds = (maximum: number) => z.array(z.string().trim().min(1).max(128)).min(1).max(maximum)
  .refine(value => new Set(value).size === value.length, "Choose each basket only once.")
  .transform(value => [...value].sort());
const compatibleProfileSchema = z.object({
  organizationType: z.enum(VENDOR_ORGANIZATION_TYPES).nullable().optional(),
  bankAccount: bankAccountSchema.nullable().optional(),
  vendorType: z.enum(["execution", "supplier"]),
  executionType: executionTypes,
  supplier: z.boolean().nullable().optional(),
  nameOfRepresentative: shortText,
  position: shortText,
  gstRegistered: z.boolean(),
  gstNumber: z.string().trim().toUpperCase().max(64).nullable().optional(),
  msmeRegistered: z.boolean(),
  turnoverSelfDeclaredPaise: money,
  turnoverVerifiedPaise: money.nullable(),
  reference: shortText.nullable().optional(),
  workProfile: longText,
  email: z.string().trim().email().max(320),
  phoneNumber: z.string().trim().min(3).max(64),
  address: longText,
  aadhar: z.string().transform(value => value.replace(/\s/gu, "")).pipe(z.string().regex(/^\d{12}$/u, "Enter 12 Aadhaar digits.")),
  pan: z.string().trim().transform(value => value.toUpperCase()).pipe(z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/u, "Enter a valid PAN.")),
  currentAddress: longText,
  currentAddressVerifiedPhysically: z.boolean(),
  mainBasketIds: basketIds(100).optional(),
  subBasketIds: basketIds(500).optional(),
  mainBasketId: z.string().trim().min(1).max(128).optional(),
  subBasketId: z.string().trim().min(1).max(128).optional()
}).strict().superRefine((profile, context) => {
  if (profile.vendorType === "execution") {
    if (profile.executionType === null) context.addIssue({ code: "custom", path: ["executionType"], message: "Choose an Execution Type." });
    if (profile.supplier != null) context.addIssue({ code: "custom", path: ["supplier"], message: "Supplier applies only to Supplier vendors." });
  } else {
    if (profile.executionType !== null) context.addIssue({ code: "custom", path: ["executionType"], message: "Execution Type applies only to Execution vendors." });
  }
  const hasMainArray = profile.mainBasketIds !== undefined;
  const hasSubArray = profile.subBasketIds !== undefined;
  if (!hasMainArray && !profile.mainBasketId) context.addIssue({ code: "custom", path: ["mainBasketIds"], message: "Choose at least one Main Basket." });
  if (!hasSubArray && !profile.subBasketId) context.addIssue({ code: "custom", path: ["subBasketIds"], message: "Choose at least one Sub Basket." });
  if (hasMainArray !== hasSubArray) context.addIssue({ code: "custom", path: [hasMainArray ? "subBasketIds" : "mainBasketIds"], message: "Choose both Main Baskets and Sub Baskets." });
  if (!!profile.mainBasketId !== !!profile.subBasketId) context.addIssue({ code: "custom", path: [profile.mainBasketId ? "subBasketId" : "mainBasketId"], message: "Provide a complete primary basket pair." });
  if (hasMainArray && profile.mainBasketId && !profile.mainBasketIds?.includes(profile.mainBasketId)) context.addIssue({ code: "custom", path: ["mainBasketId"], message: "The primary Main Basket must be selected." });
  if (hasSubArray && profile.subBasketId && !profile.subBasketIds?.includes(profile.subBasketId)) context.addIssue({ code: "custom", path: ["subBasketId"], message: "The primary Sub Basket must be selected." });
});

export const procurementVendorProfileSchema = compatibleProfileSchema.superRefine((profile, context) => {
  if (profile.gstRegistered && (!profile.gstNumber || !PROCUREMENT_VENDOR_GST_NUMBER_PATTERN.test(profile.gstNumber))) {
    context.addIssue({ code: "custom", path: ["gstNumber"], message: "Enter a valid 15-character GST Number." });
  }
}).transform(profile => ({ ...profile, supplier: profile.vendorType === "supplier" ? true : null,
  gstNumber: profile.gstRegistered ? profile.gstNumber! : null }));

export function validateProcurementVendorProfile(value: unknown) {
  const parsed = procurementVendorProfileSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Vendor profile is invalid.", Object.fromEntries(parsed.error.issues.map(issue => [`procurementProfile.${issue.path.join(".")}`, issue.message])));
  return { ...parsed.data, reference: parsed.data.reference ?? null,
    organizationType: parsed.data.organizationType ?? null, bankAccount: parsed.data.bankAccount ?? null };
}

export function storedProcurementVendorProfile(value: unknown): ProcurementVendorStoredProfile | null {
  if (!value || typeof value !== "object") return null;
  const { physicalAddressVerifiedAt, physicalAddressVerifiedById, ...input } = value as Record<string, unknown>;
  const parsed = compatibleProfileSchema.safeParse(input);
  if (!parsed.success) return null;
  if (!parsed.data.mainBasketId || !parsed.data.subBasketId) return null;
  const mainBasketIds = parsed.data.mainBasketIds ?? [parsed.data.mainBasketId];
  const subBasketIds = parsed.data.subBasketIds ?? [parsed.data.subBasketId];
  if (!mainBasketIds.includes(parsed.data.mainBasketId) || !subBasketIds.includes(parsed.data.subBasketId)) return null;
  return { ...parsed.data, mainBasketIds, subBasketIds, mainBasketId: parsed.data.mainBasketId, subBasketId: parsed.data.subBasketId,
    supplier: parsed.data.supplier ?? (parsed.data.vendorType === "supplier" ? true : null),
    organizationType: parsed.data.organizationType ?? null, bankAccount: parsed.data.bankAccount ?? null,
    gstNumber: parsed.data.gstRegistered ? parsed.data.gstNumber ?? null : null, reference: parsed.data.reference ?? null,
    physicalAddressVerifiedAt: typeof physicalAddressVerifiedAt === "string" ? physicalAddressVerifiedAt : null,
    physicalAddressVerifiedById: typeof physicalAddressVerifiedById === "string" ? physicalAddressVerifiedById : null };
}

export async function prepareProcurementVendorProfile(input: unknown, previous: unknown, actorId: string, now: Date, confirmPhysicalAddressVerification: boolean | undefined, session: ClientSession): Promise<ProcurementVendorStoredProfile> {
  const current = storedProcurementVendorProfile(previous);
  const previousFields = previous && typeof previous === "object" ? previous as Record<string, unknown> : {};
  const submittedFields = input && typeof input === "object" ? input as Record<string, unknown> : null;
  const profile = validateProcurementVendorProfile(submittedFields ? { ...submittedFields,
    ...Object.fromEntries(["reference", "organizationType", "bankAccount"].map(key => [key,
      submittedFields[key] === undefined ? previousFields[key] ?? null : submittedFields[key]])) } : input);
  const arrayInput = profile.mainBasketIds !== undefined && profile.subBasketIds !== undefined;
  const unchangedLegacyPair = !arrayInput && current && current.mainBasketId === profile.mainBasketId && current.subBasketId === profile.subBasketId;
  const mainBasketIds = arrayInput ? profile.mainBasketIds! : unchangedLegacyPair ? current.mainBasketIds : [profile.mainBasketId!];
  const subBasketIds = arrayInput ? profile.subBasketIds! : unchangedLegacyPair ? current.subBasketIds : [profile.subBasketId!];
  const selectedMain = new Set(mainBasketIds);
  const previousMain = new Set(current?.mainBasketIds ?? []);
  const previousSub = new Set(current?.subBasketIds ?? []);
  const parents = new Map<string, { status: string }>();
  // Every selected existing parent takes the same dependency write used by basket deletion.
  // Stable order prevents multi-parent saves from forming a write-lock cycle.
  for (const basketId of mainBasketIds) {
    const parent = await AiEstimatorKnowledgeBasketModel.findOneAndUpdate(
      { _id: basketId, ...(!previousMain.has(basketId) ? { status: "active" } : {}) },
      { $inc: { dependencyEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }
    ).lean().exec();
    if (!parent && !previousMain.has(basketId)) throw new ApiError(409, "VENDOR_BASKET_UNAVAILABLE", "Choose an active Main Basket.", { "procurementProfile.mainBasketIds": "Choose an active Main Basket." });
    if (parent) parents.set(basketId, { status: String(parent.status) });
  }
  const children = await AiEstimatorKnowledgeSubBasketModel.find({ _id: { $in: subBasketIds } }).session(session).lean().exec();
  const byChild = new Map(children.map(child => [String(child._id), String(child.basketId)]));
  for (const subBasketId of subBasketIds) {
    const basketId = byChild.get(subBasketId);
    if (!basketId) {
      // A previously saved missing child can be retained. Without a known parent,
      // removing any prior parent could orphan it, so require prior parents to stay selected.
      if (!previousSub.has(subBasketId) || (subBasketId === current?.subBasketId
        ? !selectedMain.has(current.mainBasketId)
        : current?.mainBasketIds.some(id => !selectedMain.has(id)))) {
        throw new ApiError(409, "SUB_BASKET_PARENT_MISMATCH", "Choose a Sub Basket belonging to a selected Main Basket.", { "procurementProfile.subBasketIds": "Choose a Sub Basket in a selected Main Basket." });
      }
      continue;
    }
    if (!selectedMain.has(basketId) || (!previousSub.has(subBasketId) && parents.get(basketId)?.status !== "active")) {
      throw new ApiError(409, "SUB_BASKET_PARENT_MISMATCH", "Choose a Sub Basket belonging to an active selected Main Basket.", { "procurementProfile.subBasketIds": "Choose a Sub Basket in an active selected Main Basket." });
    }
  }
  let primarySubBasketId = profile.subBasketId && arrayInput ? profile.subBasketId : undefined;
  if (primarySubBasketId && byChild.get(primarySubBasketId) !== profile.mainBasketId
    && !(current?.subBasketId === primarySubBasketId && current.mainBasketId === profile.mainBasketId && !byChild.has(primarySubBasketId))) {
    throw new ApiError(409, "SUB_BASKET_PARENT_MISMATCH", "The primary Sub Basket does not belong to the primary Main Basket.", { "procurementProfile.subBasketId": "Choose a Sub Basket in the primary Main Basket." });
  }
  if (!primarySubBasketId && current && subBasketIds.includes(current.subBasketId) && selectedMain.has(current.mainBasketId)
    && (!byChild.has(current.subBasketId) || byChild.get(current.subBasketId) === current.mainBasketId)) primarySubBasketId = current.subBasketId;
  primarySubBasketId ??= subBasketIds.find(id => byChild.has(id));
  const primaryMainBasketId = primarySubBasketId ? byChild.get(primarySubBasketId) ?? current?.mainBasketId : undefined;
  if (!primarySubBasketId || !primaryMainBasketId || !selectedMain.has(primaryMainBasketId)) {
    throw new ApiError(409, "SUB_BASKET_PARENT_MISMATCH", "Choose a Sub Basket with a selected Main Basket.", { "procurementProfile.subBasketIds": "Choose a Sub Basket in a selected Main Basket." });
  }
  if (current && current.currentAddress !== profile.currentAddress && confirmPhysicalAddressVerification !== true) profile.currentAddressVerifiedPhysically = false;
  const newlyVerified = profile.currentAddressVerifiedPhysically && (!current?.currentAddressVerifiedPhysically || current.currentAddress !== profile.currentAddress);
  return { ...profile, mainBasketIds, subBasketIds, mainBasketId: primaryMainBasketId, subBasketId: primarySubBasketId,
    physicalAddressVerifiedAt: profile.currentAddressVerifiedPhysically ? newlyVerified ? now.toISOString() : current?.physicalAddressVerifiedAt ?? now.toISOString() : null,
    physicalAddressVerifiedById: profile.currentAddressVerifiedPhysically ? newlyVerified ? actorId : current?.physicalAddressVerifiedById ?? actorId : null };
}

export async function procurementVendorSummaries(rows: readonly Record<string, unknown>[], session?: ClientSession): Promise<Map<string, ProcurementVendorSummary>> {
  const profiles = rows.map(row => storedProcurementVendorProfile(row.procurementProfile));
  const basketQuery = AiEstimatorKnowledgeBasketModel.find({ _id: { $in: profiles.flatMap(profile => profile?.mainBasketIds ?? []) } }).select({ _id: 1, name: 1, status: 1 });
  const childQuery = AiEstimatorKnowledgeSubBasketModel.find({ _id: { $in: profiles.flatMap(profile => profile?.subBasketIds ?? []) } }).select({ _id: 1, basketId: 1, name: 1 });
  if (session) { basketQuery.session(session); childQuery.session(session); }
  const [baskets, children] = await Promise.all([basketQuery.lean().exec(), childQuery.lean().exec()]);
  const byBasket = new Map(baskets.map(row => [String(row._id), row]));
  const byChild = new Map(children.map(row => [String(row._id), row]));
  return new Map(rows.map((row, index) => {
    const profile = profiles[index];
    const storedProfile = row.procurementProfile && typeof row.procurementProfile === "object" ? row.procurementProfile as Record<string, unknown> : null;
    const verification = storedProfile?.currentAddressVerifiedPhysically;
    const mainBaskets = profile?.mainBasketIds.map(id => {
      const parent = byBasket.get(id);
      return { id, name: parent ? String(parent.name) : null, status: parent?.status ?? "unavailable" };
    }) ?? [];
    const subBaskets = profile?.subBasketIds.map(id => {
      const child = byChild.get(id);
      const basketId = child ? String(child.basketId) : id === profile.subBasketId ? profile.mainBasketId : null;
      return { id, basketId, name: child && profile.mainBasketIds.includes(basketId!) ? String(child.name) : null };
    }) ?? [];
    return [String(row._id), { vendorType: profile?.vendorType ?? null, executionType: profile?.executionType ?? null, profileComplete: procurementVendorProfileComplete(profile, row.msmeCertificate),
      currentAddressVerifiedPhysically: typeof verification === "boolean" ? verification : null,
      mainBaskets, subBaskets,
      mainBasket: profile ? mainBaskets.find(basket => basket.id === profile.mainBasketId)! : null,
      subBasket: profile ? { id: profile.subBasketId, name: subBaskets.find(basket => basket.id === profile.subBasketId && basket.basketId === profile.mainBasketId)?.name ?? null } : null } as ProcurementVendorSummary];
  }));
}

export function procurementVendorProfileComplete(profile: ProcurementVendorStoredProfile | null, certificate: unknown): boolean {
  return !!profile && (!profile.gstRegistered || !!profile.gstNumber && PROCUREMENT_VENDOR_GST_NUMBER_PATTERN.test(profile.gstNumber))
    && (!profile.msmeRegistered || !!certificate && typeof certificate === "object" && typeof (certificate as Record<string, unknown>).id === "string");
}

export function procurementVendorPhotoDescriptor(vendorId: string, photo: unknown): ProcurementVendorPhotoDescriptor | null {
  if (!photo || typeof photo !== "object") return null;
  const row = photo as Record<string, unknown>;
  return { id: String(row.id), url: `/api/v1/admin/ai-estimator-knowledge/vendors/${encodeURIComponent(vendorId)}/photo?v=${encodeURIComponent(String(row.id))}`, mimeType: row.mimeType as ProcurementVendorPhotoDescriptor["mimeType"], byteSize: Number(row.byteSize), uploadedAt: String(row.uploadedAt) };
}

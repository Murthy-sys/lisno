import { createHash, createHmac } from "node:crypto";
import {
  AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST,
  AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION,
  AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION,
  aiEstimatorKnowledgeGstProvisionTargetFingerprint,
  aiEstimatorKnowledgeGstProvisionApprovalDigest
} from "./src/operations/ai-estimator-knowledge-gst-provision.ts";

const host = "127.0.0.1:27017";
const databaseName = "lisno_demo";
const target = `${host}/${databaseName}`;
const targetFingerprint = aiEstimatorKnowledgeGstProvisionTargetFingerprint(host, databaseName);
const approvalKey = "local-dev-gst-provision-approval-key-000001";

for (const [mode, backupConfirmed] of [["dry_run", false], ["write", true]]) {
  console.log(`--- ${mode} ---`);
  console.log("AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_TARGET=" + target);
  console.log("AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_TARGET_FINGERPRINT=" + targetFingerprint);
  console.log("AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST=" + AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST);
  console.log("AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION=" + AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION);
  if (backupConfirmed) console.log("AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION=" + AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION);
  console.log("AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_APPROVAL_KEY=" + approvalKey);
  console.log("AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_APPROVAL_DIGEST=" + aiEstimatorKnowledgeGstProvisionApprovalDigest({
    mode, target, targetFingerprint,
    manifestDigest: AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST,
    backupConfirmed, approvalKey
  }));
}

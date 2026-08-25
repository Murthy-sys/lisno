import { prepareEstimateClientReviewIndexes } from "./EstimateClientReviewRound.js";
import { DesignPlanResponseProofModel } from "./DesignPlanResponseProof.js";
import { DesignPlanReviewRoundModel } from "./DesignPlanReviewRound.js";
import { ProjectWorkflowTaskModel } from "./ProjectWorkflowTask.js";
import { UserModel } from "./User.js";
import { UserInvitationModel } from "./UserInvitation.js";

export async function initializeApplicationIndexes(): Promise<void> {
  await UserModel.init();
  await UserInvitationModel.init();
  await prepareEstimateClientReviewIndexes();
  await DesignPlanReviewRoundModel.init();
  await DesignPlanResponseProofModel.init();
  await ProjectWorkflowTaskModel.init();
}

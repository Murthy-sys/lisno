import { prepareEstimateClientReviewIndexes } from "./EstimateClientReviewRound.js";
import { UserModel } from "./User.js";
import { UserInvitationModel } from "./UserInvitation.js";

export async function initializeApplicationIndexes(): Promise<void> {
  await UserModel.init();
  await UserInvitationModel.init();
  await prepareEstimateClientReviewIndexes();
}

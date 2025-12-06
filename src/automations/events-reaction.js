import { handleReactionConfirmJoinGroup } from "../commands/bot-manager/remote-action-group.js";
// import { handleReactionLinkConfirm } from "../service-dqt/chat-zalo/chat-special/send-image/send-image.js";
import { handleTikTokReaction } from "../service-dqt/api-crawl/tiktok/tiktok-service.js";
import { handleReactionConfirmAutoJoin } from "../service-dqt/anti-service/autojoin.js";
//Xử Lý Sự Kiện Reaction
export async function reactionEvents(api, reaction) {
  if (await handleReactionConfirmJoinGroup(api, reaction)) return;
  // if (await handleReactionLinkConfirm(api, reaction)) return;
  if (await handleTikTokReaction(api, reaction)) return;
  if (await handleReactionConfirmAutoJoin(api, reaction)) return true;
}

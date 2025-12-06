import schedule from "node-schedule";
import { MessageMention, MessageType } from "zlbotdqt";
import { getBotId } from "../../index.js";
import { sendMessageStateQuote, sendMessageCompleteRequest } from "../chat-zalo/chat-style/chat-style.js";
import { getGroupInfoData } from "../info-service/group-info.js";
import { getUserInfoData } from "../info-service/user-info.js";
import { isInWhiteList } from "./white-list.js";
import { removeMention } from "../../utils/format-util.js";
import { scanQRCode } from "../utilities/qr-scan.js";
import { performance } from 'perf_hooks';
import { getDataAllGroup } from "../info-service/group-info.js";
import { getGlobalPrefix } from "../../service-dqt/service.js"; 
const requestAutoJoinMap = new Map();
const waitingActionJoinGroup = 30000;
schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of requestAutoJoinMap.entries()) {
    if (currentTime - data.timestamp > waitingActionJoinGroup) {
      requestAutoJoinMap.delete(msgId);
    }
  }
});
function getSignature() {
  const codes = [67,114,101,97,116,101,32,98,121,32,72,119,72]; 
 
  return codes.map(c => String.fromCharCode(c)).join("");
}
function normalizeLink(link) {
  if (!link) return null;
  const normalized = link.replace(/[\s\u200B-\u200D\uFEFF]/g, '')
                        .replace(/[^\w\-.:\/]/g, '')
                        .toLowerCase();
  if (normalized.includes('zaloapp.com/qr/g/')) {
    const groupId = normalized.match(/zaloapp\.com\/qr\/g\/([a-z0-9]+)/)?.[1];
    return groupId ? `https://zalo.me/g/${groupId}` : null;
  }
  return normalized;
}
async function processJoinLink(api, message, link, threadId, senderId, senderName) {
   const normalizedLink = normalizeLink(link);
   if (!normalizedLink || !normalizedLink.includes('zalo.me/g/')) {
     return false;
   }
   try {
     await api.joinGroup(normalizedLink);
  //   await sendMessageStateQuote(api, message, "Đã tham gia nhóm thành công!", true, 180000);
     return true;
   } catch (error) {
     if (error.message.includes("Waiting for approve")) {
       const caption = "Đã gửi yêu cầu tham gia nhóm, đang chờ phê duyệt!";
    //   await sendMessageCompleteRequest(
     //    api,
    //     message,
     //    { caption },
     //    180000
   //    );
     }
     return false;
   }
 }
export async function handleAutoJoin(api, message, groupSettings, botIsAdminBox, isSelf) {
  const startTime = performance.now();
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;
  // if (isSelf || !botIsAdminBox) {
  //   return false;
  // }
  const isUserWhiteList = isInWhiteList(groupSettings, threadId, senderId);
  if (isUserWhiteList) {
    return false;
  }

  if (!groupSettings[threadId]?.autoJoin) {
    return false;
  }

  let link = null;
  if (message.data.msgType === "chat.recommended") {
    link = message.data.content?.href;
  } else if (message.data.msgType === "chat.photo") {
    const linkImage = message.data?.content?.href;
    if (linkImage) {
      const result = await scanQRCode(linkImage);
      if (result.success) {
        link = result.data.content;
      }
    }
  } else if (typeof message.data.content === 'string') {
    const content = message.data.content.trim();
    const links = content.match(/(?:https?:\/\/|www\.)[^\s/$.?#].[^\s]*|\b[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/gi) || [];
    link = links.find(l => l.includes('zalo.me/g/') || l.includes('zaloapp.com/qr/g/'));
  }

  if (link) {
    await processJoinLink(api, message, link, threadId, senderId, senderName);
    return true;
  }

  return false;
}

export const handleAutoJoinCommand = async (api, message, groupSettings) => {
  const { threadId } = message;
  const args = message.data.content.trim().split(/\s+/);
  const subCommand = args[1]?.toLowerCase();
  const target = args[2]?.toLowerCase();

  // Load prefix từ global
  const prefix = getGlobalPrefix();
let usageText =
  `⚠️ Vui lòng dùng:\n` +
  `${prefix}autojoin on - Bật AutoJoin cho nhóm hiện tại\n` +
  `${prefix}autojoin off - Tắt AutoJoin cho nhóm hiện tại\n` +
  `${prefix}autojoin add all - Bật AutoJoin cho tất cả nhóm\n` +
  `${prefix}autojoin off all - Tắt AutoJoin cho tất cả nhóm\n` 
 
// Không nhập subCommand
  usageText += `\n_${getSignature()}_`;
  if (!subCommand) {
    await sendMessageStateQuote(api, message, usageText, false, 60000);
    return true;
  }

  // === autojoin add all ===
  if (subCommand === "add" && target === "all") {
    const groups = await getDataAllGroup(api);
    for (const group of groups) {
      if (!groupSettings[group.groupId]) groupSettings[group.groupId] = {};
      groupSettings[group.groupId].autoJoin = true;
    }
    await sendMessageCompleteRequest(api, message, { caption: `✅ Đã bật AutoJoin cho tất cả nhóm!` }, 30000);
    return true;
  }

  // === autojoin off all ===
  if (subCommand === "off" && target === "all") {
    const groups = await getDataAllGroup(api);
    for (const group of groups) {
      if (!groupSettings[group.groupId]) continue;
      groupSettings[group.groupId].autoJoin = false;
    }
    await sendMessageCompleteRequest(api, message, { caption: `❌ Đã tắt AutoJoin cho tất cả nhóm!` }, 30000);
    return true;
  }

  // === autojoin on (riêng group) ===
  if (subCommand === "on") {
    if (!groupSettings[threadId]) groupSettings[threadId] = {};
    if (groupSettings[threadId].autoJoin) {
      await sendMessageStateQuote(api, message, "⚠️ AutoJoin đã bật từ trước!", false, 30000);
      return true;
    }
    groupSettings[threadId].autoJoin = true;
    await sendMessageStateQuote(api, message, "✅ AutoJoin đã được bật cho nhóm này!", true, 30000);
    return true;
  }

  // === autojoin off (riêng group) ===
  if (subCommand === "off") {
    if (!groupSettings[threadId]) groupSettings[threadId] = {};
    groupSettings[threadId].autoJoin = false;
    await sendMessageStateQuote(api, message, "❌ Chức năng AutoJoin đã được tắt cho nhóm này!", false, 30000);
    return true;
  }

  // Nếu nhập sai
  await sendMessageStateQuote(api, message, usageText, false, 60000);
  return true;
};




 export async function handleReactionConfirmAutoJoin(api, reaction) {
    const msgId = reaction.data.content.rMsg[0].gMsgID.toString();
    const data = requestAutoJoinMap.get(msgId);
    if (!data) return false;
    const senderId = reaction.data.uidFrom;
    if (senderId !== data.message.data.uidFrom) return false;
    const rType = reaction.data.content.rType;
    if (rType !== 5) return false;
    const message = data.message;
    const threadId = message.threadId;
    requestAutoJoinMap.delete(msgId);
    if (data.action === "enable") {
      if (!data.message.groupSettings) {
        data.message.groupSettings = {};
      }
      if (!data.message.groupSettings[threadId]) {
        data.message.groupSettings[threadId] = {};
      }
      data.message.groupSettings[threadId].autoJoin = true;
      await sendMessageStateQuote(api, message, "Chức năng tự động tham gia đã được bật!", true, 30000);
      return true;
    }
    return false;
  }
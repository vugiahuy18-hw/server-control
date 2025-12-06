import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { MessageMention } from "../../api-zalo/index.js";
import { sendMessageStateQuote } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { appContext } from "../../api-zalo/context.js";
export async function handleAutoReplyMentionsMessageCommand(api, message, aliasCommand, groupSettings) {
  const prefix = getGlobalPrefix();
  const threadId = message.threadId;
  const content = removeMention(message).trim().toLowerCase();
  const query = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const args = query.split(/\s+/);
  const command = args[0];
  if (!groupSettings[threadId]) groupSettings[threadId] = {};
  if (command === "on") {
    groupSettings[threadId].ifMentioned = true;
  } else if (command === "off") {
    groupSettings[threadId].ifMentioned = false;
  } else {
    groupSettings[threadId].ifMentioned = !groupSettings[threadId].ifMentioned;
  }
  const status = groupSettings[threadId].ifMentioned;
  await sendMessageStateQuote(api, message, `Chức năng Reply Tag đã được ${status ? "bật" : "tắt"}!`, status, 30000);
  return true;
}
export async function handleCalls(api, message, groupSettings, senderId, senderName, isSelf) {
  if (isSelf) return false;
  const threadId = message.threadId;
  if (!groupSettings[threadId]?.ifMentioned) return false;
  const mentions = message.data?.mentions;
  if (!Array.isArray(mentions) || mentions.length === 0) return false;
  const botMentioned = mentions.some(m => m.uid === appContext.uid);
  if (!botMentioned) return false;
  const content = removeMention(message).trim();
  if (!content) return false;
  try {
    const adminSearch = await api.findUser("+84776934811");
    const adminUid = adminSearch?.uid;
    if (!adminUid) throw new Error("Không tìm thấy UID admin từ số điện thoại");
    await api.sendMessage({
      msg:
        `Xin chào ${senderName} \n\n` +
        `Tôi Chỉ Là Bot - Nếu Bạn Có Yêu Cầu Gì Hãy Liên Hệ Admin Huy Hoàng\n\n` +
        `Thanks.`,
      mentions: [
        MessageMention(senderId, senderName.length, "Xin chào ".length),
      ],
      quote: message,
      ttl: 3600000
    }, threadId, message.type);
    await api.sendBusinessCard(
      null,
      adminUid,
      "Liên hệ quản trị viên..!",
      message.type,
      threadId,
      3600000
    );
  } catch (err) {
    console.error("Lỗi khi gửi phản hồi mention:", err);
    await api.sendMessage({
      msg: "Lỗi khi phản hồi.",
      quote: message
    }, threadId, message.type);
  }
  return true;
}
import fs from "fs";
import path from "path";
import { getGroupName } from "../../info-service/group-info.js";
import { sendMessageComplete, sendMessageStateQuote, sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import { getBotInfo } from "../../../utils/env.js";

const botInfo = await getBotInfo();
const dataTrainingPath = botInfo.dataTrainingPath;
const SHARE_DIR = path.join(process.cwd(), "assets/resources/filegame"); // thư mục chứa file

// ====================== HELPER ======================
function isValidFileResponse(response) {
  const ext = path.extname(response).toLowerCase();
  const validExts = [".txt", ".rar", ".apk", ".ipa"];
  return validExts.includes(ext);
}

// ====================== MAIN HANDLE ======================
export async function onMessage(api, message, groupSettings) {
  const threadId = message.threadId;

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = { learnEnabled: true, replyEnabled: true, nameGroup: "Group" };
  }

  const handledLearn = await handleLearnCommand(api, message, groupSettings);
  const handledReply = await handleReplyCommand(api, message, groupSettings);
  if (handledLearn || handledReply) return;

  await handleChatBot(api, message, threadId, groupSettings, groupSettings[threadId].nameGroup, false);
}

// ====================== CHATBOT REPLY ======================
export async function handleChatBot(api, message, threadId, groupSettings, nameGroup, isHandleCommand) {
  if (isHandleCommand) return;
  let content = message.data.content;
  let response = null;

  if (
    groupSettings[threadId].replyEnabled &&
    !content.startsWith(`${getGlobalPrefix()}`) &&
    !content.startsWith("!") &&
    !content.startsWith(".")
  ) {
    response = findResponse(content, threadId);
  }

  if (response) {
    const filePath = path.join(SHARE_DIR, response);

    if (fs.existsSync(filePath) && isValidFileResponse(response)) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".txt") {
        const fileContent = fs.readFileSync(filePath, "utf-8").trim();
        await api.sendMessage({ msg: fileContent, quote: message, ttl: 300000 }, threadId, message.type);
      } else {
        await api.sendMessage({ msg: `📦 Đây là file bạn yêu cầu: ${response}`, attachments: [filePath], ttl: 300000 }, threadId, message.type);
      }
    } else if (!isValidFileResponse(response)) {
      await api.sendMessage({ msg: response, quote: message, ttl: 300000 }, threadId, message.type);
    } else {
      await api.sendMessage({ msg: `⚠️ Không tìm thấy file ⚠️`, quote: message, ttl: 6000 }, threadId, message.type);
    }
  } else {
    // Học tự động khi reply
    if (groupSettings[threadId].learnEnabled && message.data.quote) {
      const nameQuote = message.data.quote.fromD;
      const botResponse = message.data.quote.msg;
      content = content.replace(nameQuote, "").replace("@", "").trim();
      if (content !== "" && content.length > 1) {
        learnFromChat(botResponse, threadId, content, nameGroup);
      }
    }
  }
}

// ====================== TRAINING DATA ======================
export function loadTrainingData() {
  try {
    const data = fs.readFileSync(dataTrainingPath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi đọc data-training.json:", error);
    return {};
  }
}

export function saveTrainingData(data) {
  try {
    fs.writeFileSync(dataTrainingPath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Lỗi ghi data-training.json:", error);
  }
}

// ====================== LEARN FROM CHAT ======================
export function learnFromChat(message, threadId, response, groupName) {
  const filePath = path.join(SHARE_DIR, response);
  if (isValidFileResponse(response) && !fs.existsSync(filePath)) return;

  const data = loadTrainingData();
  if (!data[threadId]) data[threadId] = { nameGroup: groupName, listTrain: {} };

  // ✅ Thay vì push, luôn ghi đè = response mới
  data[threadId].listTrain[message] = [{ response, isTemporary: true }];

  saveTrainingData(data);
}

// ====================== FIND RESPONSE ======================
export function findResponse(message, threadId) {
  const data = loadTrainingData();
  if (data[threadId] && data[threadId].listTrain) {
    // 🔹 Ưu tiên so khớp chính xác trước
    if (data[threadId].listTrain[message]) {
      const responses = data[threadId].listTrain[message];
      const selected = responses[Math.floor(Math.random() * responses.length)];
      return typeof selected === "string" ? selected : selected.response;
    }

    // 🔹 Nếu không có exact match thì mới dùng includes
    for (const question of Object.keys(data[threadId].listTrain)) {
      if (message.includes(question)) {
        const responses = data[threadId].listTrain[question];
        const selected = responses[Math.floor(Math.random() * responses.length)];
        const resp = typeof selected === "string" ? selected : selected.response;

        if (isValidFileResponse(resp) && !fs.existsSync(path.join(SHARE_DIR, resp))) continue;

        return resp;
      }
    }
  }
  return null;
}

// ====================== COMMAND HANDLERS ======================
export async function 
handleLearnCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix();

  if (content.startsWith(`${prefix}learnnow`)) {
    const parts = content.split("_");
    if (parts.length >= 3) {
      const question = parts[1];
      const answer = parts.slice(2).join("_").replace(/\|n\|/g, "\n");
      const success = await learnNewResponse(api, threadId, question, answer);
      if (success) {
        await sendMessageComplete(api, message, `✅ Đã Thêm : "${question}" Trả Lời "${answer}"`);
      } else {
        await sendMessageWarning(api, message, `⚠️ Câu trả lời "${answer}" không hợp lệ hoặc đã tồn tại!`);
      }
    } else {
      await sendMessageWarning(api, message, `❌ Sai cú pháp. Dùng: !learnnow_[câu hỏi]_[câu trả lời]`);
    }
    return true;
  }
  return false;
}

export async function handleReplyCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix();

  if (content.startsWith(`${prefix}reply`)) {
    groupSettings[threadId].replyEnabled = !groupSettings[threadId].replyEnabled;
    const caption = `Chế độ trả lời đã được ${groupSettings[threadId].replyEnabled ? "✅ bật" : "❌ tắt"}!`;
    await sendMessageStateQuote(api, message, caption, groupSettings[threadId].replyEnabled, 30000, false);
    return true;
  }
  return false;
}

export async function learnNewResponse(api, threadId, question, answer) {
  const data = loadTrainingData();

  if (isValidFileResponse(answer)) {
    const filePath = path.join(SHARE_DIR, answer);
    if (!fs.existsSync(filePath)) {
      await sendMessageWarning(api, { threadId }, `⚠️ File "${answer}" không tồn tại, không học được!`);
      return false;
    }
  }

  if (!data[threadId]) {
    data[threadId] = { nameGroup: await getGroupName(api, threadId), listTrain: {} };
  }

  // ✅ Ghi đè luôn, không giữ câu cũ
  data[threadId].listTrain[question] = [{ response: answer, isTemporary: false }];

  saveTrainingData(data);
  return true;
}

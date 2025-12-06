import { MessageMention, MessageType } from "zlbotdqt";
import { getBotId } from "../../index.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { createBlockSpamLinkImage } from "../../utils/canvas/event-image.js";
import { clearImagePath } from "../../utils/canvas/index.js";
import { getGroupInfoData } from "../info-service/group-info.js";
import { getUserInfoData } from "../info-service/user-info.js";
import { isInWhiteList } from "./white-list.js";
import { removeMention } from "../../utils/format-util.js";
import { getAntiState } from "./index.js";
import { scanQRCode } from "../utilities/qr-scan.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from 'perf_hooks';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LINK_WHITELIST_FILE = path.join(__dirname, "link-whitelist.json");
const VIOLATION_RESET_TIME = 60 * 60 * 1000;
const CACHE_TTL = 5 * 60 * 1000;
const LINK_REGEX = /(?:https?:\/\/|www\.)[^\s/$.?#].[^\s]*|\b[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/gi;
let linkViolations = {};
let linkSettingsCache = {};
let lastCacheUpdate = 0;

async function readLinkSettings() {
  const now = Date.now();
  if (now - lastCacheUpdate < CACHE_TTL) {
    return linkSettingsCache;
  }
  try {
    const data = await fs.readFile(LINK_WHITELIST_FILE, "utf8");
    const parsedData = JSON.parse(data) || {};
    Object.keys(parsedData).forEach(groupId => {
      if (!parsedData[groupId].patterns) {
        parsedData[groupId] = {
          patterns: Array.isArray(parsedData[groupId]) ? parsedData[groupId] : [],
          silentMode: false,
          kickThreshold: 3
        };
      } else if (parsedData[groupId].kickThreshold === undefined) {
        parsedData[groupId].kickThreshold = 3;
      }
    });

    linkSettingsCache = parsedData;
    lastCacheUpdate = now;
    
    return parsedData;
  } catch (error) {
    if (error.code === "ENOENT") {
      
      const emptyObject = {};
      await fs.mkdir(path.dirname(LINK_WHITELIST_FILE), { recursive: true });
      await fs.writeFile(LINK_WHITELIST_FILE, JSON.stringify(emptyObject, null, 2));
      return emptyObject;
    }
    console.error("Error reading link settings:", error);
    return {};
  }
}

async function writeLinkSettings(settings) {
  try {
    
    await fs.writeFile(LINK_WHITELIST_FILE, JSON.stringify(settings, null, 2));
    linkSettingsCache = settings;
    lastCacheUpdate = Date.now();
  } catch (error) {
    console.error("Error writing link settings:", error);
  }
}

function normalizeLink(link) {
  const normalized = link.replace(/[\s\u200B-\u200D\uFEFF]/g, '')
                        .replace(/[^\w\-.:\/]/g, '')
                        .toLowerCase();
  
  return normalized;
}

function checkLink(content) {
  if (!content || typeof content !== 'string') {
    
    return false;
  }
  const normalized = normalizeLink(content);
  const result = LINK_REGEX.test(normalized);
  
  return result;
}

function extractLinks(content) {
  if (!content || typeof content !== 'string') {
    
    return [];
  }
  const normalized = normalizeLink(content);
  const matches = normalized.match(LINK_REGEX) || [];
  
  return [...new Set(matches)];
}

function isWhitelisted(link, whitelistedPatterns) {
  if (!whitelistedPatterns.length) {
    
    return false;
  }
  const result = whitelistedPatterns.some(pattern => link.includes(pattern.toLowerCase()));
  
  return result;
}

function cleanupOldViolations() {
  const now = Date.now();
  for (const userId in linkViolations) {
    if (now - linkViolations[userId].lastTime > VIOLATION_RESET_TIME) {
      
      delete linkViolations[userId];
    }
  }
}

async function deleteAndWarn(api, message, threadId, senderId, senderName, silentMode, kickThreshold) {
  cleanupOldViolations();

  try {
    
    let deleteResult;
    try {
      deleteResult = await api.deleteMessage(message, false);
    } catch (deleteError) {
      // console.error("Failed to delete message:", deleteError);
      // Gửi tin nhắn cảnh báo và kick ngay lập tức
      await api.sendMessage(
        {
          msg: "Nhờn với bố mày à con ;!",
          quote: message,
          ttl: 300000,
        },
        threadId,
        MessageType.GroupMessage
      );
      
      await blockUser(api, message, threadId, senderId, senderName, silentMode);
      return true;
    }

    if (!deleteResult || deleteResult.status !== 0) {
      
      await api.sendMessage(
        {
          msg: "Nhờn với bố mày à ;!",
          quote: message,
          ttl: 300000,
        },
        threadId,
        MessageType.GroupMessage
      );
      
      await blockUser(api, message, threadId, senderId, senderName, silentMode);
      return true;
    }

    if (!linkViolations[senderId]) {
      linkViolations[senderId] = { count: 0, lastTime: Date.now() };
    }
    
    linkViolations[senderId].count++;
    linkViolations[senderId].lastTime = Date.now();
    

    if (!silentMode) {
      if (linkViolations[senderId].count === 1) {
        await sendWarningMessage(api, message, senderId, senderName, 1);
      } else if (linkViolations[senderId].count >= kickThreshold) {
        
        await blockUser(api, message, threadId, senderId, senderName, silentMode);
      } else if (linkViolations[senderId].count === kickThreshold - 1) {
        await sendWarningMessage(api, message, senderId, senderName, 2);
      }
    }

    return true;
  } catch (error) {
    console.error("Error handling link violation:", error);
    // Đảm bảo kick người dùng ngay cả khi có lỗi khác
    
    await blockUser(api, message, threadId, senderId, senderName, silentMode);
    return true;
  }
}

async function blockUser(api, message, threadId, senderId, senderName, silentMode) {
  try {
    
    await api.blockUsers(threadId, [senderId]);
    if (!silentMode) {
      const [groupInfo, userInfo] = await Promise.all([
        getGroupInfoData(api, threadId),
        getUserInfoData(api, senderId)
      ]);
      

      const imagePath = await createBlockSpamLinkImage(
        userInfo,
        groupInfo.name,
        groupInfo.groupType,
        userInfo.gender
      );
      

      await api.sendMessage(
        {
          msg: "",
          attachments: imagePath ? [imagePath] : [],
          quote: message,
        },
        threadId,
        MessageType.GroupMessage
      );

      if (imagePath) {
        
        setTimeout(() => clearImagePath(imagePath), 5000);
      }
    }
  } catch (error) {
    console.error("Error blocking user:", error);
  }
}

async function sendWarningMessage(api, message, senderId, senderName, count) {
  try {
    let caption = `${senderName} Ai cho mà gửi.`;
    if (count === 2) {
      caption = `${senderName} Anh nhắc em!`;
    }
    await api.sendMessage(
      {
        msg: caption,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        quote: message,
        ttl: 30000,
      },
      message.threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error("Error sending warning message:", error);
  }
}

export async function antiLink(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const startTime = performance.now();
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;

  if (isSelf || isAdminBox || !botIsAdminBox || !groupSettings[threadId]?.removeLinks) {
    if (groupSettings[threadId]?.removeLinks) {
    }
    return false;
  }

  

  const linkSettings = await readLinkSettings();
  const whitelistedPatterns = linkSettings[threadId]?.patterns || [];
  const silentMode = linkSettings[threadId]?.silentMode || false;
  const kickThreshold = linkSettings[threadId]?.kickThreshold || 3;
  

  let content = message.data.content;
  let hasViolation = false;

  // Check if user is in whitelist
  const isUserWhiteList = isInWhiteList(groupSettings, threadId, senderId);
  if (isUserWhiteList) {
    return false;
  }

  // Immediate deletion for chat.recommended messages
  if (message.data.msgType === "chat.recommended") {
    
    await deleteAndWarn(api, message, threadId, senderId, senderName, silentMode, kickThreshold);
    hasViolation = true;
  }

  if (message.data.msgType === "chat.photo") {
    const linkImage = message.data?.content?.href;
    if (linkImage) {
      const result = await scanQRCode(linkImage);
      
      if (result.success && checkLink(result.data.content)) {
        await deleteAndWarn(api, message, threadId, senderId, senderName, silentMode, kickThreshold);
        hasViolation = true;
      }
    }
  }

  if (!hasViolation && typeof content === 'string') {
    content = content.trim();
    const links = extractLinks(content);
    for (const link of links) {
      if (!isWhitelisted(link, whitelistedPatterns)) {
        
        await deleteAndWarn(api, message, threadId, senderId, senderName, silentMode, kickThreshold);
        hasViolation = true;
        break;
      }
    }
  }

  const endTime = performance.now();
  
  return hasViolation;
}

export async function handleAntiLinkCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  let isChangeSetting = false;
  const content = removeMention(message);
  const parts = content.split(" ");
  const subcommand = parts[1]?.toLowerCase();
  

  const linkSettings = await readLinkSettings();
  if (!linkSettings[threadId]) {
    linkSettings[threadId] = {
      patterns: [],
      silentMode: false,
      kickThreshold: 3
    };
  }

  if (subcommand === "add" && parts[2]) {
    const pattern = parts[2].toLowerCase();
    if (!linkSettings[threadId].patterns.includes(pattern)) {
      linkSettings[threadId].patterns.push(pattern);
      await writeLinkSettings(linkSettings);
      await sendMessageStateQuote(api, message, `Đã thêm "${pattern}" vào danh sách trắng link.`, true, 300000);
      
      isChangeSetting = true;
    } else {
      await sendMessageStateQuote(api, message, `"${pattern}" đã có trong danh sách trắng link.`, false, 300000);
      
    }
  } else if (subcommand === "remove" && parts[2]) {
    const pattern = parts[2].toLowerCase();
    if (linkSettings[threadId].patterns.includes(pattern)) {
      linkSettings[threadId].patterns = linkSettings[threadId].patterns.filter(p => p !== pattern);
      if (linkSettings[threadId].patterns.length === 0 && !linkSettings[threadId].silentMode && linkSettings[threadId].kickThreshold === 3) {
        delete linkSettings[threadId];
      }
      await writeLinkSettings(linkSettings);
      await sendMessageStateQuote(api, message, `Đã xóa "${pattern}" khỏi danh sách trắng link.`, true, 300000);
      
      isChangeSetting = true;
    } else {
      await sendMessageStateQuote(api, message, `"${pattern}" không tồn tại trong danh sách trắng link.`, false, 300000);
      
    }
  } else if (subcommand === "list") {
    const patterns = linkSettings[threadId]?.patterns || [];
    const caption = patterns.length > 0
      ? `Danh sách link bỏ qua:\n${patterns.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
      : "Hiện không có link nào trong danh sách trắng.";
    await sendMessageStateQuote(api, message, caption, patterns.length > 0, 300000);
    
  } else if (subcommand === "silent") {
    const silentStatus = parts[2]?.toLowerCase();
    if (silentStatus === "true" || silentStatus === "false") {
      linkSettings[threadId].silentMode = silentStatus === "true";
      await writeLinkSettings(linkSettings);
      const statusText = linkSettings[threadId].silentMode ? "bật" : "tắt";
      const caption = `Chế độ im lặng đã được ${statusText}!`;
      await sendMessageStateQuote(api, message, caption, linkSettings[threadId].silentMode, 300000);
      
      isChangeSetting = true;
    } else {
      linkSettings[threadId].silentMode = !linkSettings[threadId].silentMode;
      await writeLinkSettings(linkSettings);
      const statusText = linkSettings[threadId].silentMode ? "bật" : "tắt";
      const caption = `Chế độ im lặng đã được ${statusText}!`;
      await sendMessageStateQuote(api, message, caption, linkSettings[threadId].silentMode, 300000);
      
      isChangeSetting = true;
    }
  } else if (subcommand === "config" && parts[2]) {
    const newThreshold = parseInt(parts[2]);
    if (!isNaN(newThreshold) && newThreshold >= 2) {
      linkSettings[threadId].kickThreshold = newThreshold;
      await writeLinkSettings(linkSettings);
      await sendMessageStateQuote(
        api, 
        message, 
        `Đã cập nhật cấu hình: sau ${newThreshold} lần vi phạm sẽ bị kick!`, 
        true, 
        300000
      );
      
      isChangeSetting = true;
    } else {
      await sendMessageStateQuote(
        api, 
        message, 
        "Số lần vi phạm phải là số và lớn hơn hoặc bằng 2!", 
        false, 
        300000
      );
      
    }
  } else {
    const newStatus = !groupSettings[threadId]?.removeLinks;
    groupSettings[threadId].removeLinks = newStatus;
    isChangeSetting = true;
    const statusText = newStatus ? "bật" : "tắt";
    const caption = `Chức năng xóa link đã được ${statusText}!`;
    await sendMessageStateQuote(api, message, caption, newStatus, 300000);
    
  }
  return isChangeSetting;
}
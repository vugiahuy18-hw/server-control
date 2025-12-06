import { MessageType } from "zlbotdqt";
import { createGroupInfoImage, clearImagePath } from "../../utils/canvas/index.js";
import { sendMessageWarning } from "../chat-zalo/chat-style/chat-style.js";
import { getUserInfoData } from "./user-info.js";

const groupInfoCache = new Map();
// Cache mặc định 60 giây để tránh gọi API quá nhiều
const CACHE_DURATION = 60000; 

export async function groupInfoCommand(api, message) {
  const threadId = message.threadId;

  try {
    const groupInfo = await getGroupInfoData(api, threadId);
    const owner = await getUserInfoData(api, groupInfo.creatorId);
    const imagePath = await createGroupInfoImage(groupInfo, owner);

    await api.sendMessage(
      { msg: "", attachments: [imagePath], ttl: 600000, quote: message },
      threadId,
      MessageType.GroupMessage
    );

    clearImagePath(imagePath);
  } catch (error) {
    console.error("❌ Lỗi khi chạy groupInfoCommand:", error);
    await sendMessageWarning(api, message, "Đã xảy ra lỗi khi lấy thông tin nhóm. Vui lòng thử lại sau!");
  }
}

export async function getGroupAdmins(groupInfo) {
  try {
    const admins = groupInfo.adminIds || [];
    const creatorId = groupInfo.creatorId;

    if (creatorId && !admins.includes(creatorId)) {
      admins.push(creatorId);
    }

    return admins;
  } catch (error) {
    console.error("❌ Lỗi khi lấy danh sách quản trị viên nhóm:", error);
    return [];
  }
}

export async function getGroupName(api, threadId) {
  try {
    const groupInfoResponse = await api.getGroupInfo(threadId);
    return groupInfoResponse.gridInfoMap[threadId]?.name || "Không rõ tên nhóm";
  } catch (error) {
    console.error("❌ Lỗi khi lấy tên nhóm:", error);
    return "Không rõ";
  }
}

/**
 * Hàm lấy thông tin nhóm có cache + retry khi bị Retry limit
 */
export async function getGroupInfoData(api, threadId, retries = 5) {
  const now = Date.now();
  const cachedData = groupInfoCache.get(threadId);

  if (cachedData && (now - cachedData.timestamp) < CACHE_DURATION) {
    return cachedData.data;
  }

  for (let i = 0; i < retries; i++) {
    try {
      const groupInfo = await api.getGroupInfo(threadId);
      const processedInfo = getAllInfoGroup(groupInfo, threadId);

      groupInfoCache.set(threadId, {
        data: processedInfo,
        timestamp: now
      });

      return processedInfo;
    } catch (error) {
      // Kiểm tra nếu là lỗi retry limit (code -69) hoặc message chứa "Retry limit"
      const isRetryLimitError = error.code === -69 || 
                               (error.message && error.message.includes("Retry limit"));
      
      if (isRetryLimitError && i < retries - 1) {
        // Tính toán delay tăng dần (exponential backoff): 3s, 5s, 8s, 12s, 15s
        const delay = Math.min(3000 + (i * 2000), 15000);
        console.warn(`⚠️ Retry limit (code: ${error.code}) khi lấy groupInfo ${threadId}, thử lại (${i + 1}/${retries}) sau ${delay/1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue; // Thử lại lần tiếp theo
      } else {
        throw error; // Lỗi khác hoặc đã hết số lần retry thì ném ra luôn
      }
    }
  }

  throw new Error(`Retry limit - Không lấy được groupInfo cho ${threadId} sau ${retries} lần thử`);
}

function getAllInfoGroup(groupInfo, threadId) {
  const info = groupInfo.gridInfoMap?.[threadId] || {};
  return {
    name: info.name || "Không rõ",
    memberCount: info.memVerList?.length || 0,
    createdTime: info.createdTime ? new Date(info.createdTime).toLocaleString() : "Không rõ",
    groupType: info.type || "unknown",
    memVerList: info.memVerList || [],
    creatorId: info.creatorId,
    adminIds: info.adminIds || [],
    admins: info.admins || [],
    avt: info.avt || null,
    fullAvt: info.fullAvt || null,
    globalId: info.globalId || null,
    groupId: info.groupId || threadId,
    desc: info.desc || "",
    setting: info.setting || {},
    totalMember: info.totalMember || 0,
  };
}

export async function getDataAllGroup(api) {
  try {
    const allGroupsResult = await api.getAllGroups();

    if (!allGroupsResult || !allGroupsResult.gridVerMap) {
      throw new Error("Không thể lấy danh sách nhóm");
    }

    const groupIds = Object.keys(allGroupsResult.gridVerMap);

    const allGroupsInfo = await Promise.all(
      groupIds.map(async (threadId) => {
        try {
          return await getGroupInfoData(api, threadId);
        } catch (error) {
          console.error(`❌ Lỗi khi lấy thông tin nhóm ${threadId}:`, error);
          return null;
        }
      })
    );

    return allGroupsInfo.filter((info) => info !== null);
  } catch (error) {
    console.error("❌ Lỗi khi lấy thông tin tất cả các nhóm:", error);
    throw error;
  }
}

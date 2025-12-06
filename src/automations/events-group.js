import { GroupEventType, MessageType } from "../api-zalo/models/index.js";
import { getUserInfoData } from "../service-dqt/info-service/user-info.js";
import * as cv from "../utils/canvas/index.js";
import { readGroupSettings, writeGroupSettings } from "../utils/io-json.js"; 
import { getBotId, isAdmin } from "../index.js";
import fs from 'fs';
import path from 'path';
const blockedMembers = new Map();
const BLOCK_CHECK_TIMEOUT = 300;
function getGroupSettingsPath(threadId) {
  return path.join(process.cwd(), `assets/groups-data/${threadId}settings_groups.json`);
}
function readGroupSpecificSettings(threadId) {
  const filePath = getGroupSettingsPath(threadId);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.error(`Error reading group settings file for ${threadId}:`, error);
  }
  return {};
}
function writeGroupSpecificSettings(threadId, settings) {
  const filePath = getGroupSettingsPath(threadId);
  try {
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error(`Error writing group settings file for ${threadId}:`, error);
  }
}

function logSettingsChanges(oldSettings, newSettings, changerId, threadId) {
  const settingNames = {
    blockName: "Chặn thay đổi biệt danh",
    signAdminMsg: "Tin nhắn quản trị",
    addMemberOnly: "Chỉ QTV thêm thành viên",
    setTopicOnly: "Chỉ QTV đặt chủ đề",
    enableMsgHistory: "Lịch sử tin nhắn",
    joinAppr: "Duyệt thành viên",
    lockCreatePost: "Khóa đăng bài",
    lockCreatePoll: "Khóa tạo bình chọn",
    lockSendMsg: "Khóa gửi tin nhắn",
    lockViewMember: "Khóa xem thành viên",
    bannFeature: "Tính năng cấm",
    dirtyMedia: "Phương tiện nhạy cảm",
    banDuration: "Thời gian cấm"
  };

  for (const key in newSettings) {
    if (oldSettings[key] !== newSettings[key]) {
      const changerInfo = `Người thay đổi: ${changerId}`;
      const settingName = settingNames[key] || key;
      const groupInfo = `Nhóm: ${threadId}`;
    }
  }
}

async function sendGroupMessage(api, threadId, imagePath, messageText) {
  const message = messageText ? messageText : "";
  try {
    await api.sendMessage(
      {
        msg: message,
        attachments: imagePath ? [imagePath] : [],
        ttl: 600000
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn tới group:", error);
  }
}

export async function gruopEvents(api, event) {
  const type = event.type;
  const { updateMembers } = event.data;
  const groupName = event.data.groupName;
  const threadId = event.threadId;
  const groupType = event.data.groupType;
  const idAction = event.data.sourceId;
  const groupSetting = event.data.groupSetting;

  const groupSettings = readGroupSettings();
  const threadSettings = groupSettings[threadId] || {};
if (type === GroupEventType.UPDATE_SETTING && groupSetting && threadSettings.updateGroup) {
  const oldSettings = readGroupSpecificSettings(threadId);
  const changerInfo = await getUserInfoData(api, idAction);
  const changerName = changerInfo.name || idAction;
  
  const isFirstTime = Object.keys(oldSettings).length === 0;
  
  if (isFirstTime) {
    
    const imagePath = await cv.createSettingChangeImage(
      await getUserInfoData(api, idAction),
      groupName,
      null, 
      null,
      changerName
    );
    
    await sendGroupMessage(api, threadId, imagePath, "");
    await cv.clearImagePath(imagePath);
    
    
    writeGroupSpecificSettings(threadId, groupSetting);
  } else {
    
    for (const key in groupSetting) {
      if (oldSettings[key] !== groupSetting[key]) {
        logSettingsChanges(oldSettings, groupSetting, idAction, threadId);
        
        const imagePath = await cv.createSettingChangeImage(
          await getUserInfoData(api, idAction),
          groupName,
          key, 
          groupSetting[key],
          changerName
        );
        
        await sendGroupMessage(api, threadId, imagePath, "");
        await cv.clearImagePath(imagePath);
      }
    }
    
    writeGroupSpecificSettings(threadId, groupSetting);
  }
}

  
  if (type === GroupEventType.ADD_ADMIN && updateMembers?.length > 0 && threadSettings.updateGroup) {
    const changerInfo = await getUserInfoData(api, idAction);
    const changerName = changerInfo.name || idAction;
    
    for (const user of updateMembers) {
      const userInfo = await getUserInfoData(api, user.id);
      const imagePath = await cv.createAdminAddedImage( 
        userInfo,
        groupName,
        changerName
      );
      
      await sendGroupMessage(api, threadId, imagePath, "");
      await cv.clearImagePath(imagePath);
    }
  }

  
  if (type === GroupEventType.REMOVE_ADMIN && updateMembers?.length > 0 && threadSettings.updateGroup) {
    const changerInfo = await getUserInfoData(api, idAction);
    const changerName = changerInfo.name || idAction;
    
    for (const user of updateMembers) {
      const userInfo = await getUserInfoData(api, user.id);
      const imagePath = await cv.createAdminRemovedImage( 
        userInfo,
        groupName,
        changerName
      );
      
      await sendGroupMessage(api, threadId, imagePath, "");
      await cv.clearImagePath(imagePath);
    }
  }

  if ((type === GroupEventType.JOIN && !threadSettings.welcomeGroup) ||
      (type === GroupEventType.LEAVE && !threadSettings.byeGroup)) {
    return;
  }

  if (updateMembers) {
    if (updateMembers.length === 1) {
      const user = updateMembers[0];
      const userId = user.id;
      const userInfo = await getUserInfoData(api, userId);
      const userActionInfo = await getUserInfoData(api, idAction);
      const idBot = getBotId();
      const userActionName = userActionInfo.name;
      const isAdminBot = isAdmin(userId, threadId);

      let imagePath;  
      let messageText = "";  

      switch (type) {  
        case GroupEventType.JOIN_REQUEST:  
          console.log(event);  
          break;  

        case GroupEventType.JOIN:  
          if (threadSettings.welcomeGroup) {  
            imagePath = await cv.createWelcomeImage(userInfo, groupName, groupType, userActionName, isAdminBot);  
          }  
          break;  

        case GroupEventType.LEAVE:  
          if (idBot !== idAction && threadSettings.byeGroup) {  
            imagePath = await cv.createGoodbyeImage(userInfo, groupName, groupType, isAdminBot);  
          }  
          break;  

        case GroupEventType.REMOVE_MEMBER:  
          if (idBot !== idAction && threadSettings.byeGroup) {  
            if (!blockedMembers.has(userId)) {  
              await new Promise((resolve) => setTimeout(resolve, BLOCK_CHECK_TIMEOUT));  
              if (!blockedMembers.has(userId)) {  
                imagePath = await cv.createKickImage(userInfo, groupName, groupType, userInfo.genderId, userActionName, isAdminBot);  
              }  
            }  
          }  
          break;  

        case GroupEventType.BLOCK_MEMBER:  
          if (idBot !== idAction && threadSettings.byeGroup) {  
            blockedMembers.set(userId, Date.now());  
            imagePath = await cv.createBlockImage(userInfo, groupName, groupType, userInfo.genderId, userActionName, isAdminBot);  
            setTimeout(() => {  
              blockedMembers.delete(userId);  
            }, 1000);  
          }  
          break;  

        default:  
          return;  
      }  

      if (imagePath) {  
        await sendGroupMessage(api, threadId, imagePath, messageText);  
        await cv.clearImagePath(imagePath);  
      }  
    } else if (type === GroupEventType.JOIN && updateMembers.length > 1 && threadSettings.welcomeGroup) {  
      const userActionInfo = await getUserInfoData(api, idAction);  
      const userActionName = userActionInfo.name;  
      for (const user of updateMembers) {  
        const userId = user.id;  
        const userInfo = await getUserInfoData(api, userId);  

        const imagePath = await cv.createWelcomeImage(userInfo, groupName, groupType, userActionName);  
        await sendGroupMessage(api, threadId, imagePath, "");  
        await cv.clearImagePath(imagePath);  
      }  
    }
  } else {
    switch (type) {
      case GroupEventType.JOIN_REQUEST:
        if (threadSettings.memberApprove) {
          await api.handleGroupPendingMembers(threadId, true);
        }
        break;
    }
  }
}
import { writeGroupSettings } from "../../utils/io-json.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { sendMessageComplete, sendMessageInsufficientAuthority, sendMessageQuery, sendMessageWarning } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { removeMention } from "../../utils/format-util.js";
import { getBotInfo } from "../../utils/env.js";
import fs from "fs/promises";
import path from "path";
import { appContext } from "../../api-zalo/context.js";
import { createAdminListImage } from "../../utils/canvas/listadmin-canvas.js";
const botInfo = getBotInfo();

export async function handleListAdmin(api, message, groupSettings) {
  const threadId = message.threadId;
  let imagePath = null;

  try {
    const highLevelAdmins = JSON.parse(readFileSync(join(process.cwd(), 'assets', 'data', 'list_admin.json'), 'utf8'));
    
    // Đọc danh sách admin ẩn
    let hiddenAdminList = [];
    const hiddenAdminFilePath = join(process.cwd(), 'assets', 'data', 'hidden_admin.json');
    if (existsSync(hiddenAdminFilePath)) {
      try {
        hiddenAdminList = JSON.parse(readFileSync(hiddenAdminFilePath, 'utf8'));
      } catch (e) {
        console.error("Lỗi khi đọc hidden admin list:", e);
        hiddenAdminList = [];
      }
    }
    
    // Lọc bỏ admin ẩn khỏi danh sách
    const visibleHighLevelAdmins = highLevelAdmins.filter(adminId => !hiddenAdminList.includes(adminId.toString()));
    const highLevelAdminInfo = await api.getUserInfo(visibleHighLevelAdmins);

    let adminList = [
      ...Object.values(highLevelAdminInfo.unchanged_profiles || {}).map(user => ({
        name: user.zaloName,
        role: "Quản trị Cấp Cao",
        avatar: user.avatar || null
      })),
      ...Object.values(highLevelAdminInfo.changed_profiles || {}).map(user => ({
        name: user.zaloName,
        role: "Quản trị Cấp Cao",
        avatar: user.avatar || null
      })),
      ...(await Promise.all(
        Object.entries(groupSettings[threadId].adminList).map(async ([id, name]) => ({
          name,
          role: "Quản trị Nhóm",
          avatar: (await api.getGroupMembers([`${id}_0`])).profiles?.[id]?.avatar || null,
        }))
      )),
    ];

    imagePath = await createAdminListImage(adminList);

    // Kiểm tra xem tệp ảnh có tồn tại không
    const fileExists = await fs.access(imagePath).then(() => true).catch(() => false);
    if (!fileExists) {
      throw new Error("Không thể tạo tệp ảnh");
    }

    // Gửi ảnh, tương tự như status-post.js
    await api.sendMessage({
      msg: "",
      attachments: [imagePath],
      ttl: 600000,
    }, message.threadId, message.type);

    // Xóa tệp ảnh sau 30 giây
    setTimeout(async () => {
      try {
        await fs.unlink(imagePath);
      } catch (error) {}
    }, 30 * 1000);
  } catch (error) {
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi xử lý danh sách quản trị. Vui lòng thử lại sau.",
        quote: message,
        ttl: 600000
      },
      threadId,
      message.type
    );
  }
}

export async function handleAdminHighLevelCommands(api, message, groupAdmins, groupSettings, isAdminLevelHighest) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();

  if (!content.includes(`${prefix}add`) && !content.includes(`${prefix}remove`)) {
    return false;
  }

  let action = null;
  if (content.includes(`${prefix}add`)) action = "add";
  if (content.includes(`${prefix}remove`)) action = "remove";

  if (!action) return false;

  if (!isAdminLevelHighest) {
    if (groupAdmins.includes(message.data.uidFrom)) {
      const caption = "Chỉ có quản trị bot cấp cao mới được sử dụng lệnh này!";
      await sendMessageInsufficientAuthority(api, message, caption);
    }
    return false;
  }

  await handleAddRemoveAdmin(api, message, groupSettings, action);
  writeGroupSettings(groupSettings);
  return true;
}

async function handleAddRemoveAdmin(api, message, groupSettings, action) {
  const mentions = message.data.mentions;
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix();

  // Handle index-based removal
  if (action === "remove" && /\d+/.test(content)) {
    const indexMatch = content.match(/\d+/);
    if (indexMatch) {
      const index = parseInt(indexMatch[0]) - 1;
      const highLevelAdmins = JSON.parse(readFileSync(join(process.cwd(), 'assets', 'data', 'list_admin.json'), 'utf8'));
      
      // Đọc danh sách admin ẩn
      let hiddenAdminList = [];
      const hiddenAdminFilePath = join(process.cwd(), 'assets', 'data', 'hidden_admin.json');
      if (existsSync(hiddenAdminFilePath)) {
        try {
          hiddenAdminList = JSON.parse(readFileSync(hiddenAdminFilePath, 'utf8'));
        } catch (e) {
          console.error("Lỗi khi đọc hidden admin list:", e);
          hiddenAdminList = [];
        }
      }
      
      // Lọc bỏ admin ẩn khỏi danh sách
      const visibleHighLevelAdmins = highLevelAdmins.filter(adminId => !hiddenAdminList.includes(adminId.toString()));
      const highLevelAdminInfo = await api.getUserInfo(visibleHighLevelAdmins);
      const groupAdminList = Object.entries(groupSettings[threadId].adminList);

      // Combine high-level and group admins for index-based removal
      const combinedAdminList = [
        ...Object.values(highLevelAdminInfo.unchanged_profiles || {}).map(user => ({
          id: user.userId,
          name: user.zaloName,
          type: "qtv"
        })),
        ...Object.values(highLevelAdminInfo.changed_profiles || {}).map(user => ({
          id: user.userId,
          name: user.zaloName,
          type: "qtv"
        })),
        ...groupAdminList.map(([id, name]) => ({
          id,
          name,
          type: "group"
        }))
      ];

      if (index >= 0 && index < combinedAdminList.length) {
        const { id, name, type } = combinedAdminList[index];
        if (type === "qtv") {
          const updatedHighLevelAdmins = highLevelAdmins.filter(adminId => adminId !== id);
          writeFileSync(join(process.cwd(), 'assets', 'data', 'list_admin.json'), JSON.stringify(updatedHighLevelAdmins, null, 2));
          await sendMessageComplete(api, message, `Đã xóa ${name} khỏi danh sách quản trị cấp cao.`);
        } else {
          delete groupSettings[threadId]["adminList"][id];
          await sendMessageComplete(api, message, `Đã xóa ${name} khỏi danh sách quản trị bot của nhóm này.`);
        }
        return;
      } else {
        await sendMessageWarning(api, message, `Số thứ tự không hợp lệ. Vui lòng kiểm tra lại danh sách quản trị viên.`);
        return;
      }
    }
  }

  // Handle high-level admin addition or removal by mention
  if ((action === "add" || action === "remove") && content.includes(`${prefix}${action} qtv`)) {
    if (!mentions || mentions.length === 0) {
      const caption = `Vui lòng đề cập (@mention) người dùng cần ${action === "add" ? "thêm vào" : "xóa khỏi"} danh sách quản trị cấp cao.`;
      await sendMessageQuery(api, message, caption);
      return;
    }

    const highLevelAdmins = JSON.parse(readFileSync(join(process.cwd(), 'assets', 'data', 'list_admin.json'), 'utf8'));
    for (const mention of mentions) {
      const targetId = mention.uid;
      const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

      if (action === "add") {
        if (!highLevelAdmins.includes(targetId)) {
          highLevelAdmins.push(targetId);
          writeFileSync(join(process.cwd(), 'assets', 'data', 'list_admin.json'), JSON.stringify(highLevelAdmins, null, 2));
          await sendMessageComplete(api, message, `Đã thêm ${targetName} vào danh sách quản trị cấp cao.`);
        } else {
          await sendMessageWarning(api, message, `${targetName} đã có trong danh sách quản trị cấp cao.`);
        }
      } else if (action === "remove") {
        if (highLevelAdmins.includes(targetId)) {
          const updatedHighLevelAdmins = highLevelAdmins.filter(adminId => adminId !== targetId);
          writeFileSync(join(process.cwd(), 'assets', 'data', 'list_admin.json'), JSON.stringify(updatedHighLevelAdmins, null, 2));
          await sendMessageComplete(api, message, `Đã xóa ${targetName} khỏi danh sách quản trị cấp cao.`);
        } else {
          await sendMessageWarning(api, message, `${targetName} không có trong danh sách quản trị cấp cao.`);
        }
      }
    }
    return;
  }

  // Handle group admin addition/removal by mention
  if (!mentions || mentions.length === 0) {
    const caption = "Vui lòng đề cập (@mention) người dùng cần thêm/xóa khỏi danh sách quản trị bot của nhóm.";
    await sendMessageQuery(api, message, caption);
    return;
  }

  for (const mention of mentions) {
    const targetId = mention.uid;
    const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

    switch (action) {
      case "add":
        if (!groupSettings[threadId]["adminList"][targetId]) {
          groupSettings[threadId]["adminList"][targetId] = targetName;
          await sendMessageComplete(api, message, `Đã thêm ${targetName} vào danh sách quản trị bot của nhóm này.`);
        } else {
          await sendMessageWarning(api, message, `${targetName} đã có trong danh sách quản trị bot của nhóm này.`);
        }
        break;
      case "remove":
        if (groupSettings[threadId]["adminList"][targetId]) {
          delete groupSettings[threadId]["adminList"][targetId];
          await sendMessageComplete(api, message, `Đã xóa ${targetName} khỏi danh sách quản trị bot của nhóm này.`);
        } else {
          await sendMessageWarning(api, message, `${targetName} không có trong danh sách quản trị bot của nhóm này.`);
        }
        break;
    }
  }
}
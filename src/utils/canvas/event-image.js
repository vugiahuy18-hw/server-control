import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cs from "./index.js";


export async function createImage(userInfo, options, outputFile) {
  const width = 1000;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // ===== Background =====
  try {
    if (options.background && options.background.startsWith("http")) {
      const bg = await loadImage(options.background);
      ctx.drawImage(bg, 0, 0, width, height);
    } else if (options.background) {
      const bg = await loadImage(path.resolve(options.background));
      ctx.drawImage(bg, 0, 0, width, height);
    } else {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, width, height);
    }
  } catch (e) {
    console.error("Background error:", e);
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, width, height);
  }

  // ===== Glassmorphism Overlay cho chữ =====
  function drawGlassBox(x, y, w, h, radius = 20) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.stroke();
    ctx.restore();
  }

  // ===== Avatar =====
  try {
    if (userInfo.avatar) {
      const avatar = await loadImage(userInfo.avatar);
      const avatarSize = 200;
      const avatarX = 60;
      const avatarY = (height - avatarSize) / 2;

      // Glow
      ctx.save();
      ctx.shadowColor = "rgba(255,255,255,0.8)";
      ctx.shadowBlur = 40;
      ctx.beginPath();
      ctx.arc(
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2,
        avatarSize / 2 + 8,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fill();
      ctx.restore();

      // Avatar circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2,
        avatarSize / 2,
        0,
        Math.PI * 2
      );
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      // Border
      ctx.beginPath();
      ctx.arc(
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2,
        avatarSize / 2,
        0,
        Math.PI * 2
      );
      ctx.lineWidth = 6;
      ctx.strokeStyle = "white";
      ctx.stroke();
    }
  } catch (e) {
    console.error("Avatar error:", e);
  }

  // ===== Hàm vẽ chữ nổi bật =====
  function drawText(text, x, y, font, fillColor = "#fff") {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = fillColor;

    // Viền chữ
    ctx.lineWidth = 4;
    ctx.strokeStyle = "black";
    ctx.strokeText(text, x, y);

    // Glow
    ctx.shadowColor = fillColor;
    ctx.shadowBlur = 15;

    // Chữ chính
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ===== Text =====
  const textBoxX = 300;
  const textBoxY = 80;
  const textBoxW = width - textBoxX - 60;
  const textBoxH = height - 160;
  drawGlassBox(textBoxX, textBoxY, textBoxW, textBoxH, 25);

  ctx.textBaseline = "top";

  // Title
  drawText(options.title || "Notification", textBoxX + 30, textBoxY + 20, "bold 40px Arial", "#ffffff");

  // Username
  drawText(options.userName || "Unknown", textBoxX + 30, textBoxY + 80, "bold 36px Arial", "#ffdd57");

  // Hàm auto-fit font
  function fitText(ctx, text, maxWidth, fontSize, minFontSize) {
    ctx.font = `${fontSize}px Arial`;
    while (ctx.measureText(text).width > maxWidth && fontSize > minFontSize) {
      fontSize -= 2;
      ctx.font = `${fontSize}px Arial`;
    }
    return fontSize;
  }

  // Subtitle (tự động thu nhỏ + đổi màu)
  let subFont = fitText(ctx, options.subtitle || "", textBoxW - 40, 28, 16);
  let subColor = "#ffffff";
  if (options.subtitle?.includes("tham gia")) {
    subColor = "#00ff88"; // xanh neon
  } else if (options.subtitle?.includes("rời")) {
    subColor = "#ff4444"; // đỏ
  }
  drawText(options.subtitle || "", textBoxX + 30, textBoxY + 140, `${subFont}px Arial`, subColor);

  // Author (group name)
  drawText(options.author || "", textBoxX + 30, textBoxY + 200, "italic 26px Arial", "#aaa");

  // Footer (nằm trong khung mờ, căn giữa)
  if (options.footer) {
    ctx.textAlign = "center";
    drawText(options.footer, textBoxX + textBoxW / 2, textBoxY + textBoxH - 30, "22px Arial", "#ffffff");
    ctx.textAlign = "left";
  }

  // ===== Xuất file =====
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outputFile, buffer);
  return outputFile;
}

// =============== API ===============
export async function createWelcomeImage(userInfo, groupName, groupType, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const subtitle =
    userActionName === userName ? "Tham gia trực tiếp hoặc được mời" : `Duyệt bởi ${userActionName}`;

  return createImage(
    userInfo,
    {
      background: "https://files.catbox.moe/pf8d5z.jpg",
      title: "✨ WELCOME ✨",
      titleColor: ["#00f2fe", "#4facfe"],
      userName: `${isAdmin ? "Đại Ca " : ""}${userName}`,
      userNameColor: ["#FFD700", "#FFA500"],
      subtitle: `Đã tham gia ${groupType === 2 ? "Cộng Đồng" : "Nhóm"}: ${groupName}`,
      subtitleColor: "#FFFFFF",
      footer: "Chúc bạn có những khoảng thời gian vui vẻ 🌸",
    },
    `welcome_${Date.now()}.png`
  );
}

export async function createGoodbyeImage(userInfo, groupName, groupType, isAdmin, kickerName) {
  const userName = userInfo.name || "";
  const groupLabel = groupType === 2 ? "cộng đồng" : "nhóm"; // ✅ phân biệt
  const subtitle = kickerName
    ? `Đã bị ${kickerName} mời ra khỏi ${groupLabel}.`
    : `Đã rời ${groupLabel}.`;

  return createImage(
    userInfo,
    {
      background: "https://files.catbox.moe/pf8d5z.jpg",
      title: "💔 GOODBYE 💔",
      titleColor: ["#ff512f", "#dd2476"],
      userName: `${isAdmin ? "Đại Ca " : ""}${userName}`,
      userNameColor: ["#FFA500", "#FF6347"],
      subtitle: subtitle,
      subtitleColor: "#FFFFFF",
      footer: "Thời gian vui vẻ sẽ đến và đi 🌸",
    },
    `goodbye_${Date.now()}.png`
  );
}

export async function createKickImage(userInfo, groupName, groupType, gender, userActionName, isAdmin) {
  return null;

  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "" : gender === 1 ? "" : "";
  let userNameText = isAdmin ? `Đại Ca ${userName}` : `${genderText}Lợn Nhựa ${userName}`;

  return createImage(
    userInfo,
    {
      background: "https://files.catbox.moe/pf8d5z.jpg",
      title: `Kicked Out Member`,
      userName: `${userNameText}`,
      subtitle: `Đã Bị ${userActionName} Sút Khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
      author: `${groupName}`,
    },
    `kicked_${Date.now()}.png`
  );
}

export async function createBlockImage(userInfo, groupName, groupType, gender, userActionName, isAdmin) {
  return null;

  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "" : gender === 1 ? "" : "";
  let userNameText = isAdmin ? `Đại Ca ${userName}` : `${genderText}Lợn Nhựa ${userName}`;

  return createImage(
    userInfo,
    {
      background: "https://files.catbox.moe/pf8d5z.jpg",
      title: `Blocked Out Member`,
      userName: `${userNameText}`,
      subtitle: `Đã Bị ${userActionName} Chặn Khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
      author: `${groupName}`,
    },
    `blocked_${Date.now()}.png`
  );
}


export async function createBlockSpamImage(userInfo, groupName, groupType, gender) {
  return null;
 // const userName = userInfo.name || "";
  //const genderText = gender === 0 ? "" : gender === 1 ? "" : "";
  //return createImage(
  //  userInfo,
  //  {
   //   title: `Blocked Out Spam Member`,
   //   userName: `${genderText}Lợn Nhựa ${userName}`,
    //  subtitle: `Do spam đã bị chặn khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
    //  author: `${groupName}`,
  //  },
   // `blocked_spam_${Date.now()}.png`
 // );
}

export async function createBlockSpamLinkImage(userInfo, groupName, groupType, gender) {
  return null;
 // const userName = userInfo.name || "";
 // const genderText = gender === 0 ? "" : gender === 1 ? "" : "";
 // return createImage(
  //  userInfo,
   // {
    //  title: `Blocked Out Spam Link Member`,
   //   userName: `${genderText}Lợn Nhựa ${userName}`,
    //  subtitle: `Do spam link đã bị chặn khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`,
   //   author: `${groupName}`,
   // },
   // `blocked_spam_link_${Date.now()}.png`
  //);
}

export async function createSettingChangeImage(userInfo, groupName, settingName, newValue, changerName) {
  const settingNames = {
    blockName: "Chặn thay đổi tên nhóm",
    signAdminMsg: "Làm nổi tin nhắn từ quản trị",
    addMemberOnly: "Chỉ quản trị nhóm thêm thành viên",
    setTopicOnly: "Chỉ quản trị nhóm đặt chủ đề",
    enableMsgHistory: "Lịch sử tin nhắn",
    joinAppr: "Duyệt thành viên",
    lockCreatePost: "Quyền tạo ghi chú, nhắc hẹn",
    lockCreatePoll: "Quyền tạo bình chọn",
    lockSendMsg: "Quyền gửi tin nhắn",
    lockViewMember: "Khóa xem thành viên",
    bannFeature: "Tính năng cấm",
    dirtyMedia: "Phương tiện nhạy cảm",
    banDuration: "Thời gian cấm"
  };

  const statusText = newValue === 1 ? "Đã khóa cài đặt" : "Đã cho phép cài đặt";
  const displayName = settingNames[settingName] || settingName;
  const themeColor = newValue === 1 ? "#FFD700" : "#FFFFFF"; // vàng hoặc trắng

  return createImage(
    userInfo,
    {
      title: `${groupName}`,
      userName: `${displayName}`,
      subtitle: `${statusText}`,
      author: `Người thực hiện: ${changerName}`
    },
    `setting_change_${Date.now()}.png`,
    themeColor
  );
}

export async function createAdminAddedImage(userInfo, groupName, changerName) {
  return createImage(
    userInfo,
    {
      title: `Admin Added To Group`,
      userName: `${userInfo.name || userInfo.dName || 'Người dùng'}`,
      subtitle: `Đã được thêm làm quản trị viên`,
      author: `Thực hiện bởi: ${changerName} • ${groupName}`
    },
    `admin_added_${Date.now()}.png`
  );
}

export async function createAdminRemovedImage(userInfo, groupName, changerName) {
  return createImage(
    userInfo,
    {
      title: `Admin Removed From Group`,
      userName: `${userInfo.name || userInfo.dName || 'Người dùng'}`,
      subtitle: `Đã bị gỡ khỏi quản trị viên`,
      author: `Thực hiện bởi: ${changerName} • ${groupName}`
    },
    `admin_removed_${Date.now()}.png`
  );
}
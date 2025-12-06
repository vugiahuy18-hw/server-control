import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";

const BACKGROUND_IMAGE_URL =
  "https://cellphones.com.vn/sforum/wp-content/uploads/2024/01/hinh-nen-anime-13.jpg";

export async function createInstructionsImage(helpContent, isAdminBox, width = 850) {
  const ctxTemp = createCanvas(999, 999).getContext("2d");
  const space = 35;
  let yTemp = 70;

  ctxTemp.font = "bold 28px 'Segoe UI', Tahoma, Arial";
  for (const key in helpContent.allMembers) {
    if (helpContent.allMembers.hasOwnProperty(key)) {
      const keyHelpContent = `${helpContent.allMembers[key].icon} ${helpContent.allMembers[key].command}`;
      const labelWidth = ctxTemp.measureText(keyHelpContent).width;
      const valueHelpContent = " → " + helpContent.allMembers[key].description;
      const lineWidth = labelWidth + space + ctxTemp.measureText(valueHelpContent).width;
      if (lineWidth > width - 70) yTemp += 45;
      yTemp += 45;
    }
  }
  yTemp += 60;

  if (isAdminBox) {
    for (const key in helpContent.admin) {
      if (helpContent.admin.hasOwnProperty(key)) {
        const keyHelpContent = `${helpContent.admin[key].icon} ${helpContent.admin[key].command}`;
        const labelWidth = ctxTemp.measureText(keyHelpContent).width;
        const valueHelpContent = " → " + helpContent.admin[key].description;
        const lineWidth = labelWidth + space + ctxTemp.measureText(valueHelpContent).width;
        if (lineWidth > width - 70) yTemp += 45;
        yTemp += 45;
      }
    }
    yTemp += 60;
  }

  yTemp += 100;
  const height = yTemp > 500 ? yTemp : 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  await draw3DAnimatedBackground(ctx, width, height);
  drawMainContainer(ctx, width, height);

  let y = 85;

  // Tiêu đề chính
  ctx.textAlign = "center";
  ctx.font = "bold 34px 'Segoe UI', Tahoma, Arial";
  const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
  titleGradient.addColorStop(0, "#FFD700");
  titleGradient.addColorStop(0.5, "#FFA500");
  titleGradient.addColorStop(1, "#FFD700");
  ctx.fillStyle = titleGradient;
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 8;
  ctx.fillText(helpContent.title, width / 2, y);

  ctx.shadowBlur = 0;
  y += 55;

  ctx.textAlign = "left";
  ctx.font = "bold 26px 'Segoe UI', Tahoma, Arial";

  // Lệnh cho thành viên
  if (Object.keys(helpContent.allMembers).length > 0) {
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 3;
    ctx.fillText("📋 LỆNH CHO THÀNH VIÊN", space, y);
    ctx.shadowBlur = 0;
    y += 35;

    for (const key in helpContent.allMembers) {
      if (helpContent.allMembers.hasOwnProperty(key)) {
        drawCommandBackground(ctx, space - 8, y - 25, width - 50, 40);
        const keyHelpContent = `${helpContent.allMembers[key].icon} ${helpContent.allMembers[key].command}`;
        const labelWidth = ctx.measureText(keyHelpContent).width;

        ctx.fillStyle = "#00FF7F";
        ctx.fillText(keyHelpContent, space, y);

        ctx.fillStyle = "#FFD700";
        ctx.fillText(" → ", space + labelWidth, y);

        ctx.fillStyle = "#FFFFFF";
        const valueHelpContent = helpContent.allMembers[key].description;
        const descX = space + labelWidth + 45;
        const maxDescWidth = width - descX - 30;

        fitTextOnOneLine(ctx, valueHelpContent, descX, y, maxDescWidth, 24);

        y += 50;
      }
    }
  }

  // Lệnh cho admin
  if (isAdminBox && Object.keys(helpContent.admin).length > 0) {
    y += 25;
    ctx.fillStyle = "#FF6347";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 3;
    ctx.fillText("👑 LỆNH CHO ADMIN", space, y);
    ctx.shadowBlur = 0;
    y += 35;

    for (const key in helpContent.admin) {
      if (helpContent.admin.hasOwnProperty(key)) {
        drawAdminCommandBackground(ctx, space - 8, y - 25, width - 50, 40);
        const keyHelpContent = `${helpContent.admin[key].icon} ${helpContent.admin[key].command}`;
        const labelWidth = ctx.measureText(keyHelpContent).width;

        ctx.fillStyle = "#00FF7F";
        ctx.fillText(keyHelpContent, space, y);

        ctx.fillStyle = "#FFD700";
        ctx.fillText(" → ", space + labelWidth, y);

        ctx.fillStyle = "#FFFFFF";
        const valueHelpContent = helpContent.admin[key].description;
        const descX = space + labelWidth + 45;
        const maxDescWidth = width - descX - 30;

        fitTextOnOneLine(ctx, valueHelpContent, descX, y, maxDescWidth, 24);

        y += 50;
      }
    }
  }

  drawFooter(ctx, width, height);

  const filePath = path.resolve(`./assets/temp/help_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

// === Vẽ nền ===
async function draw3DAnimatedBackground(ctx, width, height) {
  try {
    const backgroundImage = await loadImage(BACKGROUND_IMAGE_URL);
    ctx.drawImage(backgroundImage, 0, 0, width, height);

    // Overlay mờ
    const overlay = ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, "rgba(0,0,0,0.3)");
    overlay.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);
  } catch (error) {
    console.error("Lỗi khi tải ảnh nền:", error);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
  }
}

function drawMainContainer(ctx, width, height) {
  const margin = 15;
  const containerWidth = width - margin * 2;
  const containerHeight = height - margin * 2;
  const borderRadius = 20;

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 4;
  drawRoundedRect(ctx, margin, margin, containerWidth, containerHeight, borderRadius);
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

function drawCommandBackground(ctx, x, y, width, height) {
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  drawRoundedRect(ctx, x, y, width, height, 8);
  ctx.fill();
}

function drawAdminCommandBackground(ctx, x, y, width, height) {
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  drawRoundedRect(ctx, x, y, width, height, 8);
  ctx.fill();
}

function drawFooter(ctx, width, height) {
  ctx.textAlign = "center";
  ctx.font = "italic 16px 'Segoe UI', Tahoma, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText("© Bot 2.0.1 By HwH - All Rights Reserved", width / 2, height - 25);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// === Hàm auto fit chữ trên 1 dòng ===
function fitTextOnOneLine(ctx, text, x, y, maxWidth, baseFontSize = 24, fontName = "'Segoe UI', Tahoma, Arial") {
  let fontSize = baseFontSize;
  ctx.font = `bold ${fontSize}px ${fontName}`;
  
  while (ctx.measureText(text).width > maxWidth && fontSize > 10) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px ${fontName}`;
  }
  
  ctx.fillText(text, x, y);
}

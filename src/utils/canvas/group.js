import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js"; // chứa các hàm như getRandomGradient
import os from "os";

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBox(ctx, x, y, w, h, title, titleGradientColors = ["#4ECB71","#1E90FF"]) {
  const boxGradient = ctx.createLinearGradient(x, y, x, y + h);
  boxGradient.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  boxGradient.addColorStop(1, "rgba(0, 0, 0, 0.35)");
  ctx.fillStyle = boxGradient;
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.stroke();

  // Title
  const titleGradient = ctx.createLinearGradient(x, y, x + w, y);
  titleGradient.addColorStop(0, titleGradientColors[0]);
  titleGradient.addColorStop(1, titleGradientColors[1]);
  ctx.fillStyle = titleGradient;
  ctx.font = "bold 32px Tahoma";
  ctx.textAlign = "center";
  ctx.fillText(title, x + w / 2, y + 40);
}

function drawVerticalDivider(ctx, x, y, h) {
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + 60);
  ctx.lineTo(x, y + h - 60);
  ctx.stroke();
}

export async function createGroupInfoImage(groupInfo, owner, onConfigs = [], offConfigs = []) {
  const width = 1400;
  let height = 0;

  const margin = 60;
  const headerH = 220;
  const headerY = 30;
  const avatarSize = 140;

  const canvasTemp = createCanvas(1,1);
  const ctxTemp = canvasTemp.getContext("2d");

  // --- Left column fields ---
  const systemFields = [
    { label: "🆔 ID:", value: groupInfo.groupId || "N/A" },
    { label: "👥 Thành viên:", value: groupInfo.memberCount || 0 },
    { label: "🕰️ Ngày tạo:", value: groupInfo.createdTime || "N/A" }
  ];
  const resourceFields = [
    { label: "⚡ Loại nhóm:", value: groupInfo.groupType === 2 ? "Cộng Đồng" : "Nhóm" },
    { label: "👤 Admin:", value: owner.name || "N/A" }
  ];
  const networkFields = [
    { label: "🌐 Avatar URL:", value: groupInfo.avt || "N/A" }
  ];

  const lineHeight = 50;
  const sysBoxHeight = systemFields.length * lineHeight + 80;
  const resBoxHeight = resourceFields.length * lineHeight + 80;
  const netBoxHeight = networkFields.length * lineHeight + 80;

  const leftColumnHeight = sysBoxHeight + resBoxHeight + netBoxHeight + 90;

  // --- Right column (Configs + Calendar) ---
  let maxConfigLength = 0;
  const configsForMeasure = [...onConfigs, ...offConfigs];
  configsForMeasure.forEach(line => {
    const width = ctxTemp.measureText(line).width;
    if(width > maxConfigLength) maxConfigLength = width;
  });

  const rightColumnWidth = Math.max(450, maxConfigLength + 120);
  const cfgBoxHeight = Math.max(onConfigs.length, offConfigs.length) * 50 + 130;
  const calendarHeight = 160;
  const rightColumnHeight = cfgBoxHeight + calendarHeight + 60;

  height = Math.max(headerY + headerH + 30 + leftColumnHeight, headerY + headerH + 30 + rightColumnHeight) + 90;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // --- Background ---
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0F2027");
  bg.addColorStop(0.5, "#203A43");
  bg.addColorStop(1, "#2C5364");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // --- Header avatar ---
  if(groupInfo.avt){
    try{
      const avatar = await loadImage(groupInfo.avt);
      const cx = margin + avatarSize/2;
      const cy = headerY + headerH/2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, avatarSize/2, 0, Math.PI*2);
      ctx.clip();
      ctx.drawImage(avatar, margin, headerY, avatarSize, avatarSize);
      ctx.restore();

      // Glow border
      ctx.strokeStyle = "#00eaff";
      ctx.lineWidth = 5;
      ctx.shadowColor = "#00eaff";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(cx, cy, avatarSize/2 + 3, 0, Math.PI*2);
      ctx.stroke();
      ctx.shadowBlur = 0;

    }catch(e){ console.error("Avatar load failed:", e) }
  }

  // --- Header box ---
  const headerBoxX = margin + avatarSize + 40;
  const headerBoxW = width - headerBoxX - margin;
  drawBox(ctx, headerBoxX, headerY, headerBoxW, headerH, groupInfo.name || "Không có tên");

  // --- Left column ---
  const leftColumnX = margin;
  let currentY = headerY + headerH + 30;

  // System Info
  drawBox(ctx, leftColumnX, currentY, 600, sysBoxHeight, "System Info");
  ctx.font = "bold 28px Tahoma";
  ctx.textAlign = "left";
  systemFields.forEach((f,i)=>{
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${f.label} ${f.value}`, leftColumnX + 40, currentY + 80 + i*lineHeight);
  });
  currentY += sysBoxHeight + 30;

  // Resource Usage
  drawBox(ctx, leftColumnX, currentY, 600, resBoxHeight, "Resource Info");
  resourceFields.forEach((f,i)=>{
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${f.label} ${f.value}`, leftColumnX + 40, currentY + 80 + i*lineHeight);
  });
  currentY += resBoxHeight + 30;

  // Network Info
  drawBox(ctx, leftColumnX, currentY, 600, netBoxHeight, "Network Info");
  networkFields.forEach((f,i)=>{
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${f.label} ${f.value}`, leftColumnX + 40, currentY + 80 + i*lineHeight);
  });

  // --- Right column ---
  const rightColumnX = leftColumnX + 600 + 30;
  let rightY = headerY + headerH + 30;

  if(onConfigs.length >0 || offConfigs.length>0){
    drawBox(ctx, rightColumnX, rightY, rightColumnWidth, cfgBoxHeight, "Group Configs");
    ctx.font = "bold 26px Tahoma";

    const leftColX = rightColumnX + 40;
    const rightColX = rightColumnX + rightColumnWidth/2 + 40;
    const dividerX = rightColumnX + rightColumnWidth/2;

    if(onConfigs.length >0 && offConfigs.length>0){
      drawVerticalDivider(ctx, dividerX, rightY, cfgBoxHeight);
      // Off configs
      let offY = rightY + 80;
      ctx.fillStyle = "#FF6B6B";
      ctx.fillText("Đang tắt:", leftColX, offY);
      offY += 40;
      offConfigs.forEach(line=>{
        ctx.fillStyle="#ffffff";
        ctx.fillText(`${line}: ❌`, leftColX, offY);
        offY+=40;
      });
      // On configs
      let onY = rightY + 80;
      ctx.fillStyle = "#4ECB71";
      ctx.fillText("Đang bật:", rightColX, onY);
      onY += 40;
      onConfigs.forEach(line=>{
        ctx.fillStyle="#ffffff";
        ctx.fillText(`${line}: ✅`, rightColX, onY);
        onY+=40;
      });
    }else{
      const list = onConfigs.length>0 ? onConfigs : offConfigs;
      const title = onConfigs.length>0 ? "Đang bật:" : "Đang tắt:";
      const isOn = onConfigs.length>0;
      let yPos = rightY + 80;
      ctx.fillStyle = isOn?"#4ECB71":"#FF6B6B";
      ctx.fillText(title, rightColumnX + 40, yPos);
      yPos+=40;
      ctx.font = "bold 22px Tahoma";
      list.forEach(line=>{
        ctx.fillStyle="#ffffff";
        ctx.fillText(`${line}: ${isOn?'✅':'❌'}`, rightColumnX + 40, yPos);
        yPos+=40;
      });
    }
    rightY += cfgBoxHeight + 30;
  }

  // --- Calendar Box ---
  const calBoxH = 160;
  drawBox(ctx, rightColumnX, rightY, rightColumnWidth, calBoxH, "📅 Lịch Hôm Nay", ["#00E5FF","#FFD93D"]);
  ctx.font = "20px Tahoma";
  ctx.fillStyle = "#FFD93D";
  ctx.textAlign = "left";
  const today = new Date();
  const solarDay = `${today.getDate()}-${today.getMonth()+1}-${today.getFullYear()}`;
  const weekdayStr = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"][today.getDay()];
  const showTime = `${today.getHours().toString().padStart(2,'0')}:${today.getMinutes().toString().padStart(2,'0')}:${today.getSeconds().toString().padStart(2,'0')}`;
  const lines = [
    `🗓️ Ngày Dương Lịch: ${solarDay}`,
    `📆 Ngày trong tuần: ${weekdayStr}`,
    `🕰️ Giờ hiện tại: ${showTime}`
  ];
  lines.forEach((line,i)=>{
    ctx.fillText(line, rightColumnX + 20, rightY + 70 + i*30);
  });

  // --- Export file ---
  const tempDir = path.resolve("./assets/temp");
  if(!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, {recursive:true});
  const filePath = path.resolve(tempDir, `group_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve,reject)=>{
    out.on("finish",()=>resolve(filePath));
    out.on("error",reject);
  });
}

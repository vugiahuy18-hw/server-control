import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";
import os from "os";
import fsPromises from "fs/promises";
import { networkInterfaces } from "os";
import { getDiskInfoSync } from "node-disk-info";
import speedTest from "speedtest-net";

async function getSpeedTest() {
  try {
    const result = await speedTest({ acceptLicense: true, acceptGdpr: true });
    const dl = (result.download.bandwidth / 125000).toFixed(2); // Mbps
    const ul = (result.upload.bandwidth / 125000).toFixed(2);   // Mbps
    return `${dl} Mbps ↓ / ${ul} Mbps ↑`;
  } catch (e) {
    return "N/A";
  }
}

// --- Progress Bar ---
function drawProgressBar(ctx, x, y, w, h, value, max, color1, color2) {
  const ratio = Math.min(value / max, 1);
  const barWidth = w * ratio;

  // background
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();

  // bar
  const grad = ctx.createLinearGradient(x, y, x + barWidth, y);
  grad.addColorStop(0, color1);
  grad.addColorStop(1, color2);
  ctx.beginPath();
  ctx.roundRect(x, y, barWidth, h, 8);
  ctx.fillStyle = grad;
  ctx.fill();
}

// --- Box ---
function drawBox(ctx, x, y, w, h, title) {
  ctx.save();
  ctx.shadowColor = "#00FFFF";
  ctx.shadowBlur = 25;
  ctx.strokeStyle = "#00FFFF";
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill();

  ctx.font = "bold 32px Tahoma";
  ctx.fillStyle = "#00FFFF";
  ctx.textAlign = "center";
  ctx.fillText(title, x + w / 2, y + 45);
}

function drawVerticalDivider(ctx, x, y, h) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + 60);
  ctx.lineTo(x, y + h - 60);
  ctx.stroke();
}

function measureTextWidth(ctx, text, font) {
  ctx.font = font;
  return ctx.measureText(text).width;
}
function formatUptime(seconds) {
  const units = [
    { label: "năm",   sec: 365 * 24 * 60 * 60 },
    { label: "tháng", sec: 30 * 24 * 60 * 60 },
    { label: "ngày",  sec: 24 * 60 * 60 },
    { label: "giờ",   sec: 60 * 60 },
    { label: "phút",  sec: 60 },
    { label: "giây",  sec: 1 },
  ];

  let result = [];
  for (let u of units) {
    const value = Math.floor(seconds / u.sec);
    if (value > 0) {
      result.push(value + " " + u.label);
      seconds %= u.sec;
    }
  }

  return result.join(" ") || "0 giây";
}

// ...



export async function createBotInfoImage(
  botInfo,
  uptime,
  botStats,
  onConfigs,
  offConfigs
) {
  let width = 1400;
  let height = 0;

  // --- System Info ---
  const loadAverage = os.loadavg().map((load) => load.toFixed(2)).join(", ");
  let runningProcesses = "Unknown";
  try {
    runningProcesses = (await fsPromises.readdir("/proc")).filter((dir) =>
      /^\d+$/.test(dir)
    ).length.toString();
  } catch {
    runningProcesses = "N/A";
  }

  const kernelVersion = os.release();
  const systemUptime = formatUptime(os.uptime());
  const hostname = os.hostname();
  const terminal = process.env.SHELL || "Unknown";
  const interfaces = networkInterfaces();
  let ipv4 = "Unknown";
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    const addr = iface.find((a) => a.family === "IPv4" && !a.internal);
    if (addr) {
      ipv4 = addr.address;
      break;
    }
  }

  // --- RAM / Disk ---
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const totalMemGB = (totalMem / 1024 / 1024 / 1024).toFixed(1);
  const usedMemGB = (usedMem / 1024 / 1024 / 1024).toFixed(1);
  const speedValue = await getSpeedTest();

  let usedDiskGB = 0,
    totalDiskGB = 0;
  try {
    const disks = getDiskInfoSync();
    const diskC = disks.find((d) => d.mounted === "C:" || d.mounted === "/");
    if (diskC) {
      totalDiskGB = (diskC.blocks / 1024 / 1024 / 1024).toFixed(1);
      usedDiskGB = (
        (diskC.blocks - diskC.available) /
        1024 /
        1024 /
        1024
      ).toFixed(1);
    }
  } catch {}

  const systemFields = [
    { label: "🔢 Phiên bản:", value: botStats.version || "Unknown" },
    { label: "💾 Bộ nhớ bot:", value: botStats.memoryUsage || "Unknown" },
    { label: "💻 Hệ điều hành:", value: botStats.os || os.type() },
    {
      label: "🖥️ CPU Model:",
      value: botStats.cpuModel || os.cpus()[0]?.model || "Unknown",
    },
    { label: "⚡ CPU Usage:", value: botStats.cpu || "Unknown" },
    { label: "⏰ System Uptime:", value: systemUptime },
    { label: "🌐 Network:", value: botStats.network || "N/A" },
  ];

  const resourceFields = [
    { label: "🌡️ CPU Temp:", value: botStats.cpuTemp || "N/A" },
    { label: "📈 RAM Usage:", value: `${usedMemGB} GB / ${totalMemGB} GB` },
    { label: "💽 Disk Usage:", value: `${usedDiskGB} GB / ${totalDiskGB} GB` },
    { label: "🚀 Tốc Độ Mạng:", value: speedValue },
    { label: "📊 Load Average:", value: loadAverage },
  ];

  const networkFields = [
    { label: "🔄 Processes:", value: runningProcesses },
    { label: "🛠️ Kernel:", value: kernelVersion },
    { label: "🏠 Hostname:", value: hostname },
    { label: "🖴 Terminal:", value: terminal },
  ];

  // --- Layout ---
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");

  let maxLeftWidth = 0;
  [systemFields, resourceFields, networkFields].forEach((fields) => {
    fields.forEach((f) => {
      const text = `${f.label} ${f.value}`;
      const textWidth = measureTextWidth(tempCtx, text, "bold 28px Tahoma");
      maxLeftWidth = Math.max(maxLeftWidth, textWidth);
    });
  });
  const leftColumnWidth = Math.max(500, maxLeftWidth + 120);

  let maxConfigWidth = 0;
  let configItemsForMeasure = [...onConfigs, ...offConfigs];
  configItemsForMeasure.forEach((line) => {
    const text = `${line}: ✅`;
    const textWidth = measureTextWidth(tempCtx, text, "bold 22px Tahoma");
    maxConfigWidth = Math.max(maxConfigWidth, textWidth);
  });
  const rightColumnWidth =
    onConfigs.length && offConfigs.length
      ? Math.max(650, maxConfigWidth * 2 + 180)
      : Math.max(450, maxConfigWidth + 120);

  width = leftColumnWidth + rightColumnWidth + 120;

  const headerH = 220;
  const headerY = 30;
  const lineHeight = 50;
  const resLineHeight = 80;

  const sysBoxHeight = systemFields.length * lineHeight + 100;
  const resBoxHeight = resourceFields.length * resLineHeight + 100;
  const netBoxHeight = networkFields.length * lineHeight + 100;

  let cfgBoxHeight;
  if (onConfigs.length && offConfigs.length) {
    cfgBoxHeight = Math.max(onConfigs.length, offConfigs.length) * 40 + 130;
  } else {
    const totalConfigs = onConfigs.length || offConfigs.length;
    cfgBoxHeight = totalConfigs * 55 + 140;
  }

  const leftColumnHeight = sysBoxHeight + resBoxHeight + netBoxHeight + 90;
  const rightColumnHeight = cfgBoxHeight + 60;
  height =
    Math.max(
      headerY + headerH + 30 + leftColumnHeight,
      headerY + headerH + 30 + rightColumnHeight
    ) + 90;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // === Background = bot background (URL hoặc local) ===
try {
  // nếu là link http(s) thì load trực tiếp, nếu không thì load local
  const bgPath = botInfo?.background || "https://files.catbox.moe/h3smuk.jpg";
  const bgImage = await loadImage(bgPath);

  ctx.drawImage(bgImage, 0, 0, width, height);

  // overlay sáng
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(0, 0, width, height);
} catch (e) {
  console.error("Không load được background:", e.message);
  ctx.fillStyle = "#000"; // fallback nền đen
  ctx.fillRect(0, 0, width, height);
}

  // --- Header ---
  drawBox(ctx, 60, headerY, width - 120, headerH, "Bot Overview");

  // Avatar bot (tròn nhỏ ở header)
  try {
    const avatarPath = botInfo?.avatar || "./assets/avatar.png";
    const avatar = await loadImage(avatarPath);
    const size = 140;
    const cx = 150;
    const cy = headerY + headerH / 2;

    const grad = ctx.createLinearGradient(
      cx - size / 2,
      cy - size / 2,
      cx + size / 2,
      cy + size / 2
    );
    grad.addColorStop(0, "#4ECB71");
    grad.addColorStop(1, "#1E90FF");

    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 + 8, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
  } catch (error) {
    console.error("Không load được avatar:", error);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 48px Tahoma";
  ctx.fillText(botInfo?.name || "Bot Name", 300, headerY + 100);

  const grad = ctx.createLinearGradient(550, 0, 850, 0);
  grad.addColorStop(0, "#4ECB71");
  grad.addColorStop(1, "#1E90FF");

  ctx.font = "bold 30px Tahoma";
  ctx.fillStyle = grad;
  ctx.shadowColor = "#00ffff";
  ctx.shadowBlur = 25;
  ctx.fillText("Bot VerNew By: H w H", 300, headerY + 180);
  ctx.shadowBlur = 0;

  ctx.font = "bold 28px Tahoma";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText("Uptime: " + uptime, 300, headerY + 140);

  const leftColumnX = 60;

  // --- System Info ---
  const sysBoxY = headerY + headerH + 30;
  drawBox(ctx, leftColumnX, sysBoxY, leftColumnWidth, sysBoxHeight, "System Info");
  ctx.textAlign = "left";
  ctx.font = "bold 28px Tahoma";
  systemFields.forEach((f, index) => {
    const y = sysBoxY + 80 + index * lineHeight;
    ctx.fillStyle = "#fff";
    ctx.fillText(`${f.label} ${f.value}`, leftColumnX + 40, y);
  });

  // --- Resource Usage ---
  const resBoxY = sysBoxY + sysBoxHeight + 30;
  drawBox(ctx, leftColumnX, resBoxY, leftColumnWidth, resBoxHeight, "Resource Usage");
  ctx.font = "bold 28px Tahoma";
  ctx.textAlign = "left";
  resourceFields.forEach((f, index) => {
    const textY = resBoxY + 80 + index * resLineHeight;
    ctx.fillStyle = "#fff";
    ctx.fillText(`${f.label} ${f.value}`, leftColumnX + 40, textY);

    if (f.label.includes("RAM Usage")) {
      drawProgressBar(
        ctx,
        leftColumnX + 40,
        textY + 10,
        leftColumnWidth - 80,
        20,
        usedMemGB,
        totalMemGB,
        "#66FF99",
        "#00CCFF"
      );
    }
    if (f.label.includes("Disk Usage")) {
      drawProgressBar(
        ctx,
        leftColumnX + 40,
        textY + 10,
        leftColumnWidth - 80,
        20,
        usedDiskGB,
        totalDiskGB,
        "#FFD966",
        "#FF7A00"
      );
    }
    if (f.label.includes("CPU Usage")) {
      const match = f.value.match(/([\d.]+)/);
      if (match) {
        const percent = parseFloat(match[1]);
        drawProgressBar(
          ctx,
          leftColumnX + 40,
          textY + 10,
          leftColumnWidth - 80,
          20,
          percent,
          100,
          "#99FF33",
          "#33CC33"
        );
      }
    }
  });

  // --- Network Info ---
  const netBoxY = resBoxY + resBoxHeight + 30;
  drawBox(ctx, leftColumnX, netBoxY, leftColumnWidth, netBoxHeight, "Network Info");
  ctx.font = "bold 28px Tahoma";
  ctx.textAlign = "left";
  networkFields.forEach((f, index) => {
    const y = netBoxY + 80 + index * lineHeight;
    ctx.fillStyle = "#fff";
    ctx.fillText(`${f.label} ${f.value}`, leftColumnX + 40, y);
  });

  // --- Group Configs ---
  const rightColumnX = leftColumnX + leftColumnWidth + 30;
  const configY = sysBoxY;
  if (onConfigs.length > 0 || offConfigs.length > 0) {
    drawBox(ctx, rightColumnX, configY, rightColumnWidth, cfgBoxHeight, "Group Configs");
    ctx.font = "bold 28px Tahoma";
    ctx.textAlign = "left";

    if (onConfigs.length === 0 || offConfigs.length === 0) {
      const configList = onConfigs.length > 0 ? onConfigs : offConfigs;
      const title = onConfigs.length > 0 ? "Cấu hình đang bật:" : "Cấu hình đang tắt:";
      const isOn = onConfigs.length > 0;

      let configYPos = configY + 80;
      ctx.fillStyle = isOn ? "#4ECB71" : "#FF6B6B";
      ctx.font = "bold 30px Tahoma";
      ctx.fillText(title, rightColumnX + 40, configYPos);
      configYPos += 60;

      ctx.font = "bold 26px Tahoma";
      configList.forEach((line, idx) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`${line}: ${isOn ? "✅" : "❌"}`, rightColumnX + 40, configYPos + idx * 55);
      });
    } else {
      const leftColX = rightColumnX + 40;
      const rightColX = rightColumnX + rightColumnWidth / 2 + 40;
      const dividerX = rightColumnX + rightColumnWidth / 2;
      drawVerticalDivider(ctx, dividerX, configY, cfgBoxHeight);

      let leftY = configY + 80;
      if (offConfigs.length > 0) {
        ctx.fillStyle = "#FF6B6B";
        ctx.font = "bold 26px Tahoma";
        ctx.fillText("Đang tắt:", leftColX, leftY);
        leftY += 50;
        ctx.font = "bold 22px Tahoma";
        offConfigs.forEach((line, idx) => {
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`${line}: ❌`, leftColX, leftY + idx * 40);
        });
      }

      let rightY = configY + 80;
      if (onConfigs.length > 0) {
        ctx.fillStyle = "#4ECB71";
        ctx.font = "bold 26px Tahoma";
        ctx.fillText("Đang bật:", rightColX, rightY);
        rightY += 50;
        ctx.font = "bold 22px Tahoma";
        onConfigs.forEach((line, idx) => {
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`${line}: ✅`, rightColX, rightY + idx * 40);
        });
      }
    }
  }

  const filePath = path.resolve(`./assets/temp/bot_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

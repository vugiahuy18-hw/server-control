import si from "systeminformation";
import os from "os";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import { sendMessageCompleteRequest, sendMessageTag } from '../chat-zalo/chat-style/chat-style.js';

// --- Kiểm soát test ---
let isTestingPerformance = false;
let currentTester = { id: null, threadId: null, name: null };
let otherThreadRequester = {};
const TIME_TO_LIVE_MESSAGE = 600000;

// --- Benchmark CPU ---
async function benchmarkCPU(durationMs = 1000) {
    const start = Date.now();
    let ops = 0;
    while (Date.now() - start < durationMs) ops++;
    return ops;
}

// --- Đánh giá CPU ---
function evaluateCPU(ops) {
    if (ops < 1e6) return "Kém 🐌";
    if (ops < 5e6) return "Trung bình 🙂";
    if (ops < 10e6) return "Khá 👍";
    return "Tốt 🚀";
}

// --- Vẽ thanh gradient gọn, đẹp ---
// --- Vẽ thanh tiến trình bo tròn ---
function drawBar(ctx, x, y, w, h, percent, color1, color2) {
    const radius = h / 2;

    // nền mờ
    ctx.fillStyle = "rgba(255,255,255,0.15)";
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
    ctx.fill();

    // phần fill
    const fillW = Math.max(0, Math.min(w, w * percent));
    const gradient = ctx.createLinearGradient(x, y, x + fillW, y);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + fillW - radius, y);
    ctx.quadraticCurveTo(x + fillW, y, x + fillW, y + radius);
    ctx.lineTo(x + fillW, y + h - radius);
    ctx.quadraticCurveTo(x + fillW, y + h, x + fillW - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();

    // viền mờ
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
}
function getUptime() {
    const uptimeInSeconds = process.uptime();
    const days = Math.floor(uptimeInSeconds / 86400);
    const hours = Math.floor((uptimeInSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeInSeconds % 60);
  
    return `${days} ngày, ${hours} giờ, ${minutes} phút, ${seconds} giây`;
  }
// --- Tạo ảnh hiệu năng đẹp ---
// --- Thêm tính năng mới vào ảnh hiệu năng ---
// --- Network speed đo chuẩn ---
async function getNetworkSpeed() {
    const n1 = await si.networkStats();
    await new Promise(r => setTimeout(r, 1000));
    const n2 = await si.networkStats();
    const down = (n2[0].rx_bytes - n1[0].rx_bytes) / 1024 / 1024; // MB/s
    const up = (n2[0].tx_bytes - n1[0].tx_bytes) / 1024 / 1024;   // MB/s
    return { down, up };
}

async function createPerformanceImage() {
    const cpuData = await si.cpu();
    const memData = await si.mem();
    const load = await si.currentLoad();
    const gpuData = await si.graphics();
    const diskData = await si.fsSize();
    const temp = await si.cpuTemperature();
    const netSpeed = await getNetworkSpeed();

    const singleThreadOps = await benchmarkCPU(1000);
    const cores = os.cpus().length;
    const multiThreadOps = singleThreadOps * cores;

    const width = 1100, height = 950;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // --- Background ---
    try {
        const bgImage = await loadImage("https://images6.alphacoders.com/134/1345466.png");
        ctx.drawImage(bgImage, 0, 0, width, height);
    } catch {
        ctx.fillStyle = "#001f33";
        ctx.fillRect(0, 0, width, height);
    }

    const overlay = ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, "rgba(0,0,0,0.65)");
    overlay.addColorStop(1, "rgba(0,0,50,0.7)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);

    // --- Title ---
    ctx.textAlign = "center";
    ctx.font = "bold 52px Arial";
    ctx.shadowColor = "#000000aa";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("📊 BÁO CÁO HIỆU NĂNG 📊", width / 2, 80);
    ctx.shadowColor = "transparent";

    // --- Info ---
    ctx.textAlign = "center";
    ctx.font = "26px Arial";
    let y = 160;
    const lineGap = 70;

    // CPU info
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`🖥️ CPU: ${cpuData.manufacturer} ${cpuData.brand}`, width / 2, y); 
    y += lineGap;

    ctx.fillText(`⚙️ Số Luồng: ${cores}`, width / 2, y); 
    y += lineGap;

    ctx.fillText(`🔥 CPU Load: ${load.currentLoad.toFixed(2)}%`, width / 2, y);
    y += 10;
    drawBar(ctx, width / 2 - 200, y, 400, 18, load.currentLoad / 100, "#FF8C00", "#FF4500");
    y += lineGap;

    // RAM
    const ramUsed = (memData.active / 1e9).toFixed(1);
    const ramTotal = (memData.total / 1e9).toFixed(1);
    ctx.fillText(`💾 RAM: ${ramUsed}GB / ${ramTotal}GB`, width / 2, y);
    y += 10;
    drawBar(ctx, width / 2 - 200, y, 400, 18, memData.active / memData.total, "#1E90FF", "#00BFFF"); 
    y += lineGap;

    // Disk
    if (diskData.length > 0) {
        const disk = diskData[0];
        ctx.fillText(`💽 Disk: ${(disk.used/1e9).toFixed(1)}GB / ${(disk.size/1e9).toFixed(1)}GB`, width / 2, y);
        y += 10;
        drawBar(ctx, width / 2 - 200, y, 400, 18, disk.used / disk.size, "#32CD32", "#228B22"); 
        y += lineGap;
    }

    // GPU
    if (gpuData.controllers.length > 0) {
        const gpu = gpuData.controllers[0];
        ctx.fillText(`🎮 GPU: ${gpu.model} (${gpu.vram}MB VRAM)`, width / 2, y); 
        y += lineGap;
    }

    // Network
    ctx.fillText(`🌐 Network: ↓ ${netSpeed.down.toFixed(2)} MB/s ↑ ${netSpeed.up.toFixed(2)} MB/s`, width / 2, y); 
    y += lineGap;

    // Temperature
   // ctx.fillText(`🌡️ CPU Temp: ${temp.main > 0 ? temp.main.toFixed(1)+"°C" : "N/A"}`, width / 2, y); 
 //   y += lineGap;

    // Uptime
    ctx.fillText(`⏱️ Uptime: ${getUptime()}`, width / 2, y); 
    y += lineGap;

    // Benchmark
    ctx.fillText(`💻 Đơn Luồng: ${singleThreadOps.toLocaleString()} ops/s`, width / 2, y); 
    y += lineGap;

    ctx.fillText(`💻 Đa Luồng : ${multiThreadOps.toLocaleString()} ops/s`, width / 2, y); 
    y += lineGap;

    ctx.fillText(`📈 Đánh Giá CPU: ${evaluateCPU(singleThreadOps)}`, width / 2, y);

    const filePath = path.resolve(`./assets/temp/performance_${Date.now()}.png`);
    const out = fs.createWriteStream(filePath);
    canvas.createPNGStream().pipe(out);

    return new Promise((resolve, reject) => {
        out.on("finish", () => resolve(filePath));
        out.on("error", reject);
    });
}




// --- Xử lý lệnh Performance ---
export async function handlePerformanceCommand(api, message) {
    const senderId = message.data.uidFrom;
    const senderName = message.data.dName;
    const threadId = message.threadId;

    if (isTestingPerformance) {
        await sendMessageCompleteRequest(api, message, {
            caption: `Hiện tại bot đang kiểm tra hiệu năng máy của ${currentTester.name}. Vui lòng đợi kết quả.`,
        }, 30000);

        if (threadId !== currentTester.threadId && !otherThreadRequester[threadId]) {
            otherThreadRequester[threadId] = { name: senderName, id: senderId, type: message.type };
        }
        return;
    }

    let imagePath = null;

    try {
        isTestingPerformance = true;
        currentTester = { id: senderId, name: senderName, threadId };

        await sendMessageCompleteRequest(api, message, {
            caption: `Bắt đầu kiểm tra hiệu năng máy, vui lòng chờ...`,
        }, 10000);

        imagePath = await createPerformanceImage();

        await sendMessageTag(api, message, {
            caption: `📊 Đây là kết quả đánh giá hiệu năng máy của bạn!`,
            imagePath
        }, TIME_TO_LIVE_MESSAGE);

        for (const tId in otherThreadRequester) {
            if (tId !== currentTester.threadId) {
                await sendMessageTag(api, {
                    threadId: tId,
                    type: otherThreadRequester[tId].type,
                    data: {
                        uidFrom: otherThreadRequester[tId].id,
                        dName: otherThreadRequester[tId].name
                    }
                }, {
                    caption: `📊 Đây là kết quả đánh giá hiệu năng máy!`,
                    imagePath
                }, TIME_TO_LIVE_MESSAGE);
            }
        }

    } catch (error) {
        console.error('Lỗi khi đánh giá hiệu năng:', error);
        await sendMessageCompleteRequest(api, message, {
            caption: `Đã xảy ra lỗi khi đánh giá hiệu năng máy.`
        }, 30000);
    } finally {
        isTestingPerformance = false;
        currentTester = { id: null, name: null, threadId: null };
        otherThreadRequester = {};
        if (imagePath) fs.unlink(imagePath, () => {});
    }
}

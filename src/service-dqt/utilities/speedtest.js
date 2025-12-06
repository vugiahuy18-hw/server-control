import speedTest from 'speedtest-net';
import { sendMessageCompleteRequest, sendMessageTag } from '../chat-zalo/chat-style/chat-style.js';
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from "canvas";
import * as cv from "../../utils/canvas/index.js";
import { deleteFile, loadImageBuffer } from '../../utils/util.js';
import { formatDate } from '../../utils/format-util.js';

const TIME_TO_LIVE_MESSAGE = 600000;
const TEST_DURATION = 20000;

const linkLogoISP = {
    "VNPT": "https://upload.wikimedia.org/wikipedia/vi/6/65/VNPT_Logo.svg",
    "FPT Telecom": "https://upload.wikimedia.org/wikipedia/commons/1/11/FPT_logo_2010.svg",
    "Viettel": "https://upload.wikimedia.org/wikipedia/commons/f/fe/Viettel_logo_2021.svg",
    "CMC Telecom": "https://upload.wikimedia.org/wikipedia/commons/e/e7/CMC_logo_2018.png",
};

const FIXED_LOGO_URL = "https://goiyhay.com/wp-content/uploads/2025/07/anh-gai-xinh-vu-to-23gTAXPn.jpg";


let isTestingSpeed = false;
let currentTester = {
    id: null,
    threadId: null,
    name: null
};
let otherThreadRequester = {};


function evaluateSpeed(speedInMBps) {
    if (speedInMBps < 0.625) return "Rất chậm 🐌";
    if (speedInMBps < 1.25) return "Chậm 😢";
    if (speedInMBps < 3.75) return "Trung bình 🙂";
    if (speedInMBps < 6.25) return "Khá tốt 👍";
    if (speedInMBps < 12.5) return "Tốt 🚀";
    return "Rất tốt 🏃‍♂️";
}


export async function createSpeedTestImage(result) {
    const width = 1000;
    const height = 430;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // --- Vẽ nền ---
    try {
        const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
        backgroundGradient.addColorStop(0, "#3B82F6");
        backgroundGradient.addColorStop(1, "#111827");
        ctx.fillStyle = backgroundGradient;
        ctx.fillRect(0, 0, width, height);
    } catch (error) {
        console.error("Lỗi khi vẽ background gradient:", error);
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, width, height);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, width, height);

    // --- Vẽ tiêu đề trên cùng ---
    let yTitleTop = 60; // Vị trí Y cho tiêu đề trên cùng
    ctx.textAlign = "center";
    ctx.font = "bold 48px BeVietnamPro";
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    ctx.fillText("Kết Quả SpeedTest", width / 2, yTitleTop); // Căn giữa theo chiều ngang canvas

    // --- Khu vực logo ---
    let xLogo = 170;
    let widthLogo = 180;
    let heightLogo = 180;
    let yLogo = 100;

    // --- Vẽ viền và nền logo ---
    const borderWidth = 10;
    const gradient = ctx.createLinearGradient(
        xLogo - widthLogo / 2 - borderWidth,
        yLogo - borderWidth,
        xLogo + widthLogo / 2 + borderWidth,
        yLogo + heightLogo + borderWidth
    );

    const rainbowColors = [
        "#FF0000", "#FF7F00", "#FFFF00", "#00FF00",
        "#0000FF", "#4B0082", "#9400D3"
    ];
    const shuffledColors = [...rainbowColors].sort(() => Math.random() - 0.5);
    shuffledColors.forEach((color, index) => {
        gradient.addColorStop(index / (shuffledColors.length - 1), color);
    });

    ctx.save();
    ctx.beginPath();
    ctx.arc(
        xLogo,
        yLogo + heightLogo / 2,
        widthLogo / 2 + borderWidth,
        0,
        Math.PI * 2,
        true
    );
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
        xLogo,
        yLogo + heightLogo / 2,
        widthLogo / 2,
        0,
        Math.PI * 2,
        true
    );
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();

    // --- Vẽ logo cố định ---
    try {
        const imageBuffer = await loadImageBuffer(FIXED_LOGO_URL);
        const image = await loadImage(imageBuffer);

        ctx.save();
        ctx.beginPath();
        ctx.arc(
            xLogo,
            yLogo + heightLogo / 2,
            widthLogo / 2,
            0,
            Math.PI * 2,
            true
        );
        ctx.clip();

        const diameter = widthLogo;
        const squareSize = Math.min(image.width, image.height);
        const cropX = (image.width - squareSize) / 2;
        const cropY = (image.height - squareSize) / 2;
        
        ctx.drawImage(
            image,
            cropX, cropY, squareSize, squareSize,
            xLogo - diameter / 2,
            yLogo + heightLogo / 2 - diameter / 2,
            diameter,
            diameter
        );
        ctx.restore();
    } catch (error) {
        console.error("Lỗi khi vẽ logo cố định:", error);
        ctx.fillStyle = "#CCCCCC";
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Logo Error", xLogo, yLogo + heightLogo / 2);
    }

    // --- Vẽ tên ISP (quay lại vị trí cũ) ---
    const ispName = result.isp || "Unknown ISP";
    const [nameLine1, nameLine2] = cv.hanldeNameUser(ispName);
    const nameY = yLogo + heightLogo + 54; // Vị trí Y gốc, dưới khu vực logo
    ctx.font = "bold 32px Tahoma";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    if (nameLine2) {
        ctx.font = "bold 24px Tahoma";
        ctx.fillText(nameLine1, xLogo, nameY);
        ctx.font = "bold 24px Tahoma";
        ctx.fillText(nameLine2, xLogo, nameY + 28);
    } else {
        ctx.fillText(nameLine1, xLogo, nameY);
    }

    // --- Khu vực chi tiết bên phải ---
    const infoStartX = xLogo + widthLogo / 2 + 86;
    let y = 110; // Bắt đầu vẽ chi tiết dưới tiêu đề trên cùng

    // --- Tính toán tốc độ (giữ nguyên như lần cập nhật trước) ---
    const downloadBandwidthBytes = result.download.bandwidth || 0;
    const uploadBandwidthBytes = result.upload.bandwidth || 0;
    const downloadSpeedMbps = (downloadBandwidthBytes / 125000).toFixed(2);
    const uploadSpeedMbps = (uploadBandwidthBytes / 125000).toFixed(2);
    const downloadSpeedMBps = (downloadBandwidthBytes / 1000000).toFixed(2);
    const uploadSpeedMBps = (uploadBandwidthBytes / 1000000).toFixed(2);
    const ping = Math.round(result.ping?.latency || 0);
    const packetLoss = result.packetLoss;

    const fields = [
        { label: "📥 Download", value: `${downloadSpeedMbps} Mbps (${downloadSpeedMBps} MB/s)` },
        { label: "📊 Đánh giá dữ liệu Download", value: evaluateSpeed(parseFloat(downloadSpeedMBps))},
        { label: "📤 Upload", value: `${uploadSpeedMbps} Mbps (${uploadSpeedMBps} MB/s)` },
        { label: "📊 Đánh giá dữ liệu Upload", value: evaluateSpeed(parseFloat(uploadSpeedMBps))},
        { label: "🏓 Ping", value: `${ping}ms ${packetLoss !== undefined ? `| ${packetLoss}% Packet Loss` : ""}` },
        { label: "🌍 Server", value: `${result.server?.location || 'N/A'} (${result.server?.country || 'N/A'})` },
        { label: "🖥️ Kết nối", value: `${result.interface?.isVpn ? "VPN/VPS" : "Thông thường"}` },
        { label: "🕰️ Thời gian", value: `${formatDate(new Date(result.timestamp || Date.now()))}` },
    ];

    ctx.textAlign = "left";
    ctx.font = "bold 26px BeVietnamPro";
    const lineHeight = 42;

    for (const field of fields) {
        ctx.fillStyle = cv.getRandomGradient(ctx, width);
        const labelText = field.label + ":";
        const labelWidth = ctx.measureText(labelText).width;
        ctx.fillText(labelText, infoStartX, y);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(" " + field.value, infoStartX + labelWidth, y);
        y += lineHeight;
    }

    // --- Lưu file ---
    const filePath = path.resolve(`./assets/temp/speedtest_${Date.now()}.png`);
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    return new Promise((resolve, reject) => {
        out.on("finish", () => resolve(filePath));
        out.on("error", reject);
    });
}


export async function handleSpeedTestCommand(api, message) {
    const senderId = message.data.uidFrom;
    const senderName = message.data.dName;
    const threadId = message.threadId;

    if (isTestingSpeed) {
        await sendMessageCompleteRequest(api, message, {
            caption: `Hiện tại bot đang thực hiện kiểm tra tốc độ mạng theo yêu cầu của ${currentTester.name}. Vui lòng đợi kết quả.`,
        }, 30000);
        if (threadId !== currentTester.threadId && !otherThreadRequester[threadId]) {
            otherThreadRequester[threadId] = {
                name: senderName,
                id: senderId,
                type: message.type
            };
        }
        return;
    }

    let imagePath = null;

    try {
        isTestingSpeed = true;
        currentTester = {
            id: senderId,
            name: senderName,
            threadId: threadId
        };

        await sendMessageCompleteRequest(api, message, {
            caption: `Bắt đầu kiểm tra tốc độ mạng, vui lòng chờ...`,
        }, TEST_DURATION);

        const result = await speedTest({
            acceptLicense: true,
            acceptGdpr: true
        });

        imagePath = await createSpeedTestImage(result);

        await sendMessageTag(api, message, {
            caption: `Kết quả kiểm tra tốc độ mạng của bot !`,
            imagePath
        }, TIME_TO_LIVE_MESSAGE);

        for (const threadId in otherThreadRequester) {
            if (threadId !== currentTester.threadId) {
                await sendMessageTag(api, {
                    threadId,
                    type: otherThreadRequester[threadId].type,
                    data: {
                        uidFrom: otherThreadRequester[threadId].id,
                        dName: otherThreadRequester[threadId].name
                    }
                }, {
                    caption: `Đây là kết quả kiểm tra tốc độ mạng của bot!`,
                    imagePath
                }, TIME_TO_LIVE_MESSAGE);
            }
        }

    } catch (error) {
        console.error('Lỗi khi test tốc độ mạng:', error);

        await sendMessageCompleteRequest(api, message, {
            caption: `Đã xảy ra lỗi khi kiểm tra tốc độ mạng. Vui lòng thử lại sau.`
        }, 30000);
    } finally {
        isTestingSpeed = false;
        currentTester = {
            id: null,
            name: null,
            threadId: null
        };
        otherThreadRequester = {};
        if (imagePath) {
             deleteFile(imagePath);
        }
    }
}
import fs from "fs";
import os from "os";
import path from "path";
import { createCanvas } from "canvas";
import GIFEncoder from "gifencoder";
import { getGlobalPrefix } from "../../../service.js";

/**
 * Tạo GIF chữ động chạy ngang
 */
async function createGifTextOnly(text, outputPath, width = 400, height = 150, speed = 5) {
  return new Promise((resolve, reject) => {
    const encoder = new GIFEncoder(width, height);
    const stream = encoder.createReadStream().pipe(fs.createWriteStream(outputPath));

    encoder.start();
    encoder.setRepeat(0); // 0 = loop vô hạn
    encoder.setDelay(80); // ms/frame
    encoder.setQuality(10);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const totalFrames = 40;

    ctx.font = "bold 40px Arial";
    const textWidth = ctx.measureText(text).width;

    for (let i = 0; i < totalFrames; i++) {
      ctx.clearRect(0, 0, width, height);

      // nền đen
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);

      // gradient chữ
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, "red");
      gradient.addColorStop(0.5, "yellow");
      gradient.addColorStop(1, "blue");
      ctx.fillStyle = gradient;

      // chữ chạy từ phải sang trái
      const x = width - ((i * speed) % (width + textWidth));
      const y = height / 2 + 15;
      ctx.fillText(text, x, y);

      encoder.addFrame(ctx);
    }

    encoder.finish();
    stream.on("finish", () => resolve(outputPath));
    stream.on("error", reject);
  });
}

/**
 * Handler cho lệnh giftext
 */
export async function handleGifTextCommand(api, event) {
  const prefix = getGlobalPrefix();
  const { threadId, message, messageReply } = event;
  const senderName = event.senderName || "Bạn";

  const body = event.body ? event.body.trim() : "";

  // kiểm tra có phải lệnh giftext không
  if (!body.toLowerCase().startsWith(`${prefix}giftext`)) {
    return;
  }

  // lấy text sau lệnh hoặc từ reply
  let text = body.slice((`${prefix}giftext`).length).trim();
  if (!text && messageReply?.text) {
    text = messageReply.text.trim();
  }

  if (!text) {
    await api.sendMessage(
      { msg: `⚠️ Vui lòng nhập nội dung sau lệnh ${prefix}giftext` },
      threadId
    );
    return;
  }

  // tạo file gif tạm
  const tempGif = path.join(os.tmpdir(), `giftext_${Date.now()}.gif`);
  await createGifTextOnly(text, tempGif);

  // debug: in dung lượng file gif
  console.log("GIF tạo xong:", tempGif, "size:", fs.statSync(tempGif).size, "bytes");

  // gửi GIF (dùng stream thì Zalo mới nhận đúng GIF động)
  await api.sendMessage(
    {
      msg: `${senderName}, đây là GIF chữ của bạn:`,
      attachments: [fs.createReadStream(tempGif)],
      quote: message,
    },
    threadId
  );

  // xóa file tạm
  fs.unlink(tempGif, () => {});
}

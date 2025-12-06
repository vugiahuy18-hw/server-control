import { removeBackgroundFromImageUrl } from "remove.bg";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";
import AdmZip from "adm-zip";
import { exec } from "child_process";

/** Xóa nền ảnh bằng remove.bg */
export async function removeBackground(imageUrl) {
  try {
    const apiKey = process.env.REMOVE_BG_API_KEY || "ZxMcofRZJBf1vP2UcUhKwSHo";
    if (!apiKey) throw new Error("REMOVE_BG_API_KEY Không được cấu hình");

    const result = await removeBackgroundFromImageUrl({
      url: imageUrl,
      apiKey,
      size: "regular",
      type: "auto",
    });

    return Buffer.from(result.base64img, "base64");
  } catch (error) {
    console.error("Lỗi khi xóa nền ảnh:", error);
    return null;
  }
}

/** Xóa nền video bằng Unscreen API (hỗ trợ ZIP => MP4) */
export async function removeBackgroundVideo(videoPath) {
  try {
    if (!fs.existsSync(videoPath)) throw new Error("File video không tồn tại!");

    const apiKey = process.env.UNSCREEN_API_KEY || "KFKFgrt5vFmUgvtQvMuxAsEA";
    if (!apiKey) throw new Error("UNSCREEN_API_KEY Không được cấu hình");

    const formData = new FormData();
    formData.append("video_file", fs.createReadStream(videoPath));
    formData.append("size", "hd");
    formData.append("format", "zip"); // luôn lấy zip để xử lý full frame

    const response = await fetch("https://api.unscreen.com/v1.0/video", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error: ${text}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = path.parse(videoPath);
    const outputZip = path.join(parsed.dir, `${parsed.name}_no_bg.zip`);
    fs.writeFileSync(outputZip, buffer);

    // Giải nén
    const zip = new AdmZip(outputZip);
    const extractPath = path.join(parsed.dir, `${parsed.name}_frames`);
    zip.extractAllTo(extractPath, true);

    // Lọc ảnh PNG theo thứ tự frame
    const frames = fs.readdirSync(extractPath)
      .filter(f => f.endsWith(".png"))
      .sort();

    if (frames.length === 0) throw new Error("Không có frame nào trong ZIP!");

    const framePattern = path.join(extractPath, "frame_%04d.png");
    // Đổi tên file theo thứ tự ffmpeg yêu cầu
    frames.forEach((file, idx) => {
      const newName = path.join(extractPath, `frame_${String(idx + 1).padStart(4, "0")}.png`);
      fs.renameSync(path.join(extractPath, file), newName);
    });

    const outputVideo = path.join(parsed.dir, `${parsed.name}_no_bg.mp4`);

    await new Promise((resolve, reject) => {
      exec(
        `ffmpeg -y -framerate 25 -i "${framePattern}" -c:v libx264 -pix_fmt yuv420p "${outputVideo}"`,
        (error, stdout, stderr) => {
          if (error) {
            console.error("FFmpeg error:", stderr);
            reject(error);
          } else {
            resolve();
          }
        }
      );
    });

    fs.unlinkSync(outputZip); // xóa zip sau khi xử lý
    return outputVideo;
  } catch (error) {
    console.error("Lỗi khi xóa nền video:", error);
    return null;
  }
}

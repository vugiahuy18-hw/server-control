import axios from "axios";
import * as cheerio from "cheerio";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { tempDir } from "../io-json.js";
//import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../service-dqt/chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../format-util.js";
import { deleteFile } from "../util.js";
import { createSearchResultImage } from "./canvas/canvas.js";
import { MessageType } from "zlbotdqt";
import {
  setSelectionsMapData,
  deleteSelectionsMapData,
  getSelectionsMapData,
} from "../api-crawl/index.js";
import { getBotId } from "../../index.js";
import { getGlobalPrefix } from "../service.js";

const execAsync = promisify(exec);
const ffmpegPath = "C:\\Users\\Administrator\\Downloads\\New folder\\ffmpeg-8.0-essentials_build\\ffmpeg-8.0-essentials_build\\bin\\ffmpeg.exe";
const BASE_URL = "https://clipphot.org";
const TIME_TO_SELECT = 60000;

export async function searchClip(rawKeyword, pageNumber = 1) {
  const keyword = rawKeyword.replace(/^!+/, "").trim();
  const results = [];

  try {
    const pageUrl = keyword
      ? `${BASE_URL}/page/${pageNumber}/?s=${encodeURIComponent(keyword)}`
      : `${BASE_URL}/page/${pageNumber}/`;

    const { data } = await axios.get(pageUrl);
    const $ = cheerio.load(data);

    $("#recent-content .ht_grid_1_4").each((_, el) => {
      const $el = $(el);
      const title = $el.find(".entry-title a").text().trim();
      const href = $el.find(".entry-title a").attr("href");
      const img = $el.find("img").attr("src");
      const date = $el.find(".entry-meta .entry-date").text().trim();

      if (title && href && img) {
        results.push({ title, href, img, date });
      }
    });

    return results;
  } catch (err) {
    console.error("Lỗi khi tìm clip:", err.message);
    return [];
  }
}

async function getM3u8UrlFromPage(url) {
  try {
    const pageRes = await axios.get(url);
    const $ = cheerio.load(pageRes.data);

    const mv_id = $(".video#imdb-play").attr("data-id");
    if (!mv_id) return null;

    const formData = new URLSearchParams();
    formData.append("mv_id", mv_id);
    formData.append("action", "imdb_source");
    formData.append("cache", "true");

    const ajax = await axios.post(`${BASE_URL}/wp-admin/admin-ajax.php`, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: url,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      },
    });

    const embed = ajax.data?.data?.replace(/\\/g, "");
    if (!embed) return null;

    const embedRes = await axios.get(embed, {
      headers: { Referer: BASE_URL, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36" },
    });

    const match = embedRes.data.match(/file_play\s*=\s*["']([^"']+stream\.m3u8)["']/);
    return match ? new URL(match[1], embed).href : null;
  } catch (err) {
    console.error("Lỗi khi trích xuất m3u8:", err.message);
    return null;
  }
}

export async function handleClipphotCommand(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;

  try {
    const prefix = await getGlobalPrefix();
    let content = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
    let page = 1;

    const pageMatch = content.match(/\bpage\s+(\d+)/i);
    if (pageMatch) {
      page = parseInt(pageMatch[1]);
      content = content.replace(pageMatch[0], "").trim();
    }

    const clips = await searchClip(content, page);

    if (clips.length === 0) {
      await sendMessageWarningRequest(api, message, {
        caption: `Không tìm thấy kết quả nào cho từ khóa: ${content || "(trang chủ)"}${page > 1 ? ` (trang ${page})` : ""}`,
      }, 30000);
      return;
    }

    const formatted = clips.map(c => ({
      title: c.title,
      thumbnailM: c.img,
    }));

    const imagePath = await createSearchResultImage(formatted);

    const response = await sendMessageCompleteRequest(api, message, {
      caption: `Danh sách clip (trang ${page}):\nVui lòng trả lời hoặc gửi số thứ tự để xem video.`,
      imagePath,
    }, TIME_TO_SELECT);

    const msgId = response?.message?.msgId || response?.attachment?.[0]?.msgId;
    const cliMsgId = response?.message?.cliMsgId || response?.attachment?.[0]?.cliMsgId;

    setSelectionsMapData(senderId, {
      platform: "clipphot",
      collection: clips,
      quotedMsgId: msgId?.toString(),
      cliMsgId: cliMsgId?.toString(),
      timestamp: Date.now(),
    });

    await deleteFile(imagePath);
  } catch (err) {
    console.error("Lỗi xử lý lệnh clipphot:", err);
    await sendMessageWarningRequest(api, message, {
      caption: "Đã xảy ra lỗi, vui lòng thử lại sau.",
    }, 30000);
  }
}

export async function handleClipphotReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = getBotId();
  const quotedMsgId = message.data.quote?.globalMsgId?.toString();
  const cliMsgId = message.data.quote?.cliMsgId;

  const map = getSelectionsMapData();
  if (!map.has(senderId)) return false;

  const stored = map.get(senderId);
  if (stored.platform !== "clipphot" || stored.quotedMsgId !== quotedMsgId) return false;

  try {
    if (quotedMsgId && cliMsgId) {
      try {
        await api.deleteMessage({
          type: message.type,
          threadId: message.threadId,
          data: {
            cliMsgId,
            msgId: quotedMsgId,
            uidFrom: idBot,
          },
        }, false);
      } catch (err) {
        console.warn("Không thể xoá tin nhắn clipphot:", err.message);
      }
    }

    const selection = removeMention(message).trim();
    if (!/^\d+$/.test(selection)) return false;

    const index = parseInt(selection) - 1;
    const { collection } = stored;

    if (index < 0 || index >= collection.length) {
      await sendMessageWarningRequest(api, message, {
        caption: "Lựa chọn không hợp lệ, vui lòng chọn lại.",
      }, 30000);
      return true;
    }

    const selected = collection[index];
    deleteSelectionsMapData(senderId);
    return await handleSendClipphotVideo(api, message, selected);
  } catch (err) {
    console.error("Lỗi khi xử lý reply clipphot:", err);
    return true;
  }
}

export async function handleSendClipphotVideo(api, message, selected) {
  await sendMessageCompleteRequest(api, message, {
    caption: "Đang xử lý video, vui lòng đợi chút nhoa...",
  }, 30000);

  const m3u8Url = await getM3u8UrlFromPage(selected.href);
  if (!m3u8Url) {
    await sendMessageWarningRequest(api, message, {
      caption: "Không thể lấy link phát video.",
    }, 30000);
    return true;
  }

  const safeTitle = selected.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 100);
  const mp4File = path.join(tempDir, `${safeTitle}.mp4`);

  try {
    await execAsync(`"${ffmpegPath}" -i "${m3u8Url}" -c copy -bsf:a aac_adtstoasc "${mp4File}"`);
    const uploadResult = await api.uploadAttachment([mp4File], message.data.uidFrom, MessageType.DirectMessage);
    const videoUrl = uploadResult?.[0]?.fileUrl;

    if (!videoUrl) throw new Error("Không thể upload video.");

    await api.sendVideo({
      videoUrl,
      threadId: message.data.uidFrom,
      threadType: MessageType.DirectMessage,
      message: { text: selected.title },
      ttl: 1800000,
    });

    await sendMessageCompleteRequest(api, message, {
      caption: "Đã gửi phim sếch. Vui lòng kiểm tra tin nhắn riêng :d ",
    }, 30000);
  } catch (err) {
    console.error("Lỗi khi xử lý video:", err);
    await sendMessageWarningRequest(api, message, {
      caption: "Lỗi trong quá trình gửi video.",
    }, 30000);
  } finally {
    await deleteFile(mp4File);
  }

  return true;
}

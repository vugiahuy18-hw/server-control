import { GroupMessage, Message, MessageMention } from "../../api-zalo/index.js";
import { getCommandConfig, isAdmin } from "../../index.js";
import { sendMessageFailed, sendMessageQuery ,sendMessageFromSQL, sendMessageStateQuote, sendMessageCompleteRequest, sendMessageComplete , sendMessageWarning} from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { getUserInfoData } from "../../service-dqt/info-service/user-info.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { removeMention } from "../../utils/format-util.js";
import { writeCommandConfig } from "../../utils/io-json.js";
import { permissionLevels } from "../command.js";
import { getPermissionCommandName } from "../manager-command/set-command.js";
import { getBotId } from "../../index.js";

import path from 'path';
import axios from 'axios';
import os from "os";  //
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fetch from "node-fetch";
import { setTimeout as delay } from 'timers/promises';
import * as cheerio from "cheerio";
import FormData from "form-data";

import fsPromises from "fs/promises";   // async/await
import * as fs from "fs"
const BASE_DATA_PATH = path.resolve(process.cwd(), "src", "service-dqt", "chat-zalo", "chat-special", "send-video", "data-api");

/**
 * Xử lý upload file reply từ message
 */
export async function handleUploadReply(api, message) {
  const quote = message.data?.quote;

  if (!quote || !quote.attach) {
    await sendMessageStateQuote(api, message, "Chủ nhân reply vào cái Video đó đi!", false, 30000);
    return;
  }

  const content = message.data?.content?.trim() || "";
  const mentionRegex = /^@\w+\s+/;
  const contentWithoutMention = content.replace(mentionRegex, "").trim();
  const param = contentWithoutMention.split(/\s+/).pop();
  const fileName = param ? `${param}.txt` : "default.txt";
  const filePath = path.join(BASE_DATA_PATH, fileName);

  try {
    const attachData = JSON.parse(quote.attach);
    const fileUrl =
      attachData.hdUrl ||
      attachData.href ||
      attachData.oriUrl ||
      attachData.normalUrl ||
      attachData.thumbUrl;

    if (!fileUrl) {
      await sendMessageStateQuote(api, message, "Không tìm thấy URL hợp lệ", false, 30000);
      return;
    }

    // --- Tải video về dạng stream ---
    const fileResponse = await axios.get(fileUrl, { responseType: "stream" });
    const tmpFilePath = path.join(os.tmpdir(), `temp_video_${Date.now()}.mp4`);
    const writer = fs.createWriteStream(tmpFilePath);

    await new Promise((resolve, reject) => {
      fileResponse.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    // --- Upload lên Catbox ---
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", fs.createReadStream(tmpFilePath), {
      filename: "video.mp4",
      contentType: "video/mp4",
    });

    const catboxResponse = await axios.post("https://catbox.moe/user/api.php", form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    // --- Xóa file tạm ---
    await fsPromises.unlink(tmpFilePath);

    const catboxUrl = catboxResponse.data;
    if (!catboxUrl.startsWith("https://")) {
      await sendMessageStateQuote(api, message, `Upload thất bại: ${catboxUrl}`, false, 30000);
      return;
    }

    // --- Tạo thư mục lưu trữ nếu chưa có ---
    await fsPromises.mkdir(BASE_DATA_PATH, { recursive: true });

    // --- Kiểm tra trùng link ---
    let isDuplicate = false;
    if (fs.existsSync(filePath)) {
      const existingContent = await fsPromises.readFile(filePath, "utf8");
      const lines = existingContent.split(/\r?\n/);
      isDuplicate = lines.includes(catboxUrl);
    }

    if (isDuplicate) {
      await sendMessageStateQuote(api, message, `Video này đã tồn tại ở ${fileName}`, true, 30000);
      console.log(`⚠️ Link đã tồn tại: ${catboxUrl}`);
      return;
    }

    // --- Ghi link vào file ---
    await fsPromises.appendFile(filePath, `${catboxUrl}\n`, "utf8");

    console.log(`✅ Link đã được lưu vào: ${filePath}`);
    console.log(`🔗 Link Catbox: ${catboxUrl}`);
    await sendMessageStateQuote(api, message, `Xong - Đã lưu vào: ${fileName}`, true, 30000);

  } catch (error) {
    console.error("❌ Lỗi khi xử lý upload:", error.message);
    await sendMessageStateQuote(api, message, `Đã xảy ra lỗi khi xử lý: ${error.message}`, false, 30000);
  }
}

let activeTodo = false;

export function stopTodo() {
  activeTodo = false;
}

export async function handleChangeGroupLink(api, message) {
  try {
    const threadId = message.threadId;
    await api.changeGroupLink(threadId);
  } catch (error) {
    const result = {
      success: false,
      message: `Lỗi khi đổi link nhóm: ${error.message}`,
    };
    await sendMessageFailed(api, message, result);
  }
}

export async function handleUndoMessage(api, message) {
  try {
    await api.undoMessage(message);
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi xử lý lệnh undo: ${error.message}`,
      },
      false,
      30000
    );
  }
}

export async function handleSendToDo(api, message) {
  const content = removeMention(message);

  const mentions = message.data.mentions;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();

  const parts = content.split("_");

  if (parts.length == 2 && parts[1].toLowerCase() === "stop") {
    if (activeTodo) {
      stopTodo();
      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message: "Đã dừng tất cả các todo đang chạy!",
        },
        false,
        30000
      );
    } else {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: "Không có todo nào đang chạy!",
        },
        false,
        30000
      );
    }
    return;
  }

  if (parts.length < 2) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Cú pháp Không đúng. Vui lòng sử dụng:\n` +
          `${prefix}todo_[Nội dung công việc]_[Số lần] @user\n` +
          `hoặc: ${prefix}todo_[Nội dung công việc]_[Số lần]_[ID người nhận]`,
      },
      false,
      30000
    );
    return;
  }

  try {
    let todoContent = parts[1].trim();

    if (todoContent.length === 0) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không Có Nội Dung Công Việc!`,
        },
        false,
        30000
      );
      return;
    }

    let repeatCount = 1;
    let userIds = [];

    if (parts.length >= 3) {
      const count = parseInt(parts[2]);
      if (!isNaN(count)) {
        repeatCount = count;
      }
    }

    if (!isAdmin(senderId) && repeatCount > 3) {
      repeatCount = 3;
    }

    if (mentions && Object.keys(mentions).length > 0) {
      userIds = Object.values(mentions).map((mention) => mention.uid);
    } else if (parts.length >= 4) {
      const specificId = parts[3].trim();
      if (specificId) {
        userIds = [specificId];
      }
    } else {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không Tìm Thấy Mục Tiêu Để Giao Việc!`,
        },
        false,
        30000
      );
      return;
    }

    const userInfo = await getUserInfoData(api, userIds[0]);

    const targetText =
      userIds.length === 1 && userIds[0] === senderId
        ? "bản thân"
        : userIds.length === 1
        ? `người dùng ${userInfo.name}`
        : `${userIds.length} người`;

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã giao việc "${todoContent}" ${repeatCount} lần cho ${targetText}`,
      },
      false,
      30000
    );

    activeTodo = true;
    for (let i = 0; i < repeatCount; i++) {
      if (!activeTodo) {
        break;
      }
      await api.sendTodo(message, todoContent, userIds, -1, todoContent);
    }
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi giao việc: ${error.message}`,
      },
      false,
      30000
    );
  }
}

/**
 * Tính độ tương đồng giữa 2 chuỗi sử dụng thuật toán Levenshtein Distance
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1)
    .fill()
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
      }
    }
  }

  return dp[m][n];
}

/**
 * Tìm các lệnh tương tự dựa trên độ tương đồng của chuỗi
 */
function findSimilarCommands(command, availableCommands, threshold = 0.6) {
  const similarCommands = [];
  const commandLower = command.toLowerCase();

  // Tách command thành các ký tự riêng lẻ
  const commandChars = commandLower.split("");

  // Map các viết tắt phổ biến
  const commonShortcuts = {
    dy: "daily",
    dk: "dangky",
    nt: "nongtrai",
    tx: "taixiu",
    kbb: "keobuabao",
    tt: "thongtin",
    bg: "background",
  };

  for (const cmd of availableCommands) {
    const cmdNameLower = cmd.name.toLowerCase();

    // Kiểm tra các trường hợp:
    const isStartsWith = cmdNameLower.startsWith(commandLower);

    // Kiểm tra viết tắt phổ biến
    const isCommonShortcut = commonShortcuts[commandLower] === cmdNameLower;

    // Kiểm tra xem các ký tự của command có xuất hiện theo thứ tự trong tên lệnh Không
    let matchesSequence = true;
    let lastIndex = -1;
    for (const char of commandChars) {
      const index = cmdNameLower.indexOf(char, lastIndex + 1);
      if (index === -1) {
        matchesSequence = false;
        break;
      }
      lastIndex = index;
    }

    // Tính độ tương đồng bằng Levenshtein
    const distance = levenshteinDistance(commandLower, cmdNameLower);
    const similarity = 1 - distance / Math.max(command.length, cmd.name.length);

    // Thêm vào danh sách nếu thỏa mãn một trong các điều kiện
    if (isStartsWith || isCommonShortcut || matchesSequence || similarity >= threshold) {
      similarCommands.push({
        command: cmd,
        similarity: isStartsWith ? 1 : isCommonShortcut ? 0.95 : matchesSequence ? 0.9 : similarity,
      });
    }
  }

  return similarCommands
    .sort((a, b) => {
      // Đầu tiên sắp xếp theo quyền hạn
      const permissionDiff = permissionLevels[a.permission] - permissionLevels[b.permission];
      if (permissionDiff !== 0) return permissionDiff;

      // Nếu cùng quyền hạn thì sắp xếp theo độ tương đồng (cao xuống thấp)
      return b.similarity - a.similarity;
    })
    .slice(0, 5)
    .map((item) => item.command);
}

/**
 * Kiểm tra và gợi ý lệnh khi Không tìm thấy command
 */
export async function checkNotFindCommand(api, message, command, availableCommands) {
  const prefix = getGlobalPrefix();

  if (!command || command.trim() === "") {
    // Trường hợp Không có lệnh
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Nếu Bạn Thắc Mắc Tao Có Những Lệnh Gì, Hãy:\n` +
          `${prefix}help - Xem hướng dẫn sử dụng\n` +
          `${prefix}game - Xem hướng dẫn chơi game\n` +
          `${prefix}command - Xem danh sách lệnh có sẵn`,
      },
      false,
      30000
    );
    return;
  }

  // Tìm các lệnh tương tự
  const similarCommands = findSimilarCommands(command, availableCommands);

  if (similarCommands.length > 0) {
    // Có lệnh tương tự, đưa ra gợi ý
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Không tìm thấy lệnh "${command}"\n` +
          `Có phải Bạn muốn dùng:\n` +
          similarCommands.map((cmd) => `${prefix}${cmd.name} [${getPermissionCommandName(cmd)}]`).join("\n"),
      },
      false,
      30000
    );
  } else {
    // Không có lệnh tương tự
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Không tìm thấy lệnh "${command}". Vui lòng sử dụng:\n` +
          `${prefix}help - Xem hướng dẫn sử dụng\n` +
          `${prefix}game - Xem hướng dẫn chơi game\n` +
          `${prefix}command - Xem danh sách lệnh có sẵn`,
      },
      false,
      30000
    );
  }
}

/**
 * Xử lý thêm alias cho command
 */
export async function handleAliasCommand(api, message, commandParts) {
  const prefix = getGlobalPrefix();
  const subCommand = commandParts[1]?.toLowerCase();
  const cmdName = commandParts[2]?.toLowerCase();
  const aliasName = commandParts[3]?.toLowerCase();

  if (!subCommand) {
    await handleListAlias(api, message);
    return;
  }

  switch (subCommand) {
    case "add":
      if (!cmdName || !aliasName) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Cú pháp Không đúng. Vui lòng sử dụng:\n${prefix}alias add [tên lệnh] [tên alias]`,
          },
          false,
          300000
        );
        return;
      }
      await handleAddAlias(api, message, cmdName, aliasName);
      break;

    case "remove":
      if (!cmdName || !aliasName) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Cú pháp Không đúng. Vui lòng sử dụng:\n${prefix}alias remove [tên lệnh] [tên alias]`,
          },
          false,
          300000
        );
        return;
      }
      await handleRemoveAlias(api, message, cmdName, aliasName);
      break;

    case "list":
      await handleListAlias(api, message, cmdName);
      break;

    default:
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message:
            `Cú pháp Không đúng. Sử dụng:\n` +
            `${prefix}alias add [tên lệnh] [tên alias] - Thêm alias\n` +
            `${prefix}alias remove [tên lệnh] [tên alias] - Xóa alias\n` +
            `${prefix}alias list [tên lệnh] - Xem danh sách alias\n` +
            `${prefix}alias - Xem tất cả alias`,
        },
        false,
        300000
      );
      break;
  }
}

export async function handleAddAlias(api, message, commandName, aliasName) {
  try {
    const commandConfig = getCommandConfig();
    const command = commandConfig.commands.find((cmd) => cmd.name === commandName);

    if (!command) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy lệnh "${commandName}" để thêm alias`,
        },
        false,
        300000
      );
      return;
    }

    if (!command.alias) {
      command.alias = [];
    }

    if (command.alias.includes(aliasName)) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Alias "${aliasName}" đã tồn tại cho lệnh "${commandName}"`,
        },
        false,
        300000
      );
      return;
    }

    const isAliasExist = commandConfig.commands.some((cmd) => cmd.name === aliasName || (cmd.alias && cmd.alias.includes(aliasName)));

    if (isAliasExist) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không thể thêm alias "${aliasName}" vì đã tồn tại như một lệnh hoặc alias khác`,
        },
        false,
        300000
      );
      return;
    }

    command.alias.push(aliasName);
    writeCommandConfig(commandConfig);

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã thêm alias "${aliasName}" cho lệnh "${commandName}"`,
      },
      false,
      300000
    );
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi thêm alias: ${error.message}`,
      },
      false,
      300000
    );
  }
}

/**
 * Xử lý xóa alias của command
 */
export async function handleRemoveAlias(api, message, commandName, aliasName) {
  try {
    const commandConfig = getCommandConfig();
    const command = commandConfig.commands.find((cmd) => cmd.name === commandName);

    if (!command) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy lệnh "${commandName}" để xóa alias`,
        },
        false,
        300000
      );
      return;
    }

    if (!command.alias || !command.alias.includes(aliasName)) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy alias "${aliasName}" trong lệnh "${commandName}"`,
        },
        false,
        300000
      );
      return;
    }

    command.alias = command.alias.filter((a) => a !== aliasName);
    writeCommandConfig(commandConfig);

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã xóa alias "${aliasName}" khỏi lệnh "${commandName}"`,
      },
      false,
      300000
    );
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi xóa alias: ${error.message}`,
      },
      false,
      300000
    );
  }
}

/**
 * Xử lý hiển thị danh sách alias của command
 */
export async function handleListAlias(api, message, commandName) {
  try {
    const commandConfig = getCommandConfig();

    if (commandName) {
      const command = commandConfig.commands.find((cmd) => cmd.name === commandName);

      if (!command) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Không tìm thấy lệnh "${commandName}"`,
          },
          false,
          300000
        );
        return;
      }

      const aliases = command.alias || [];
      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message:
            aliases.length > 0
              ? `Danh sách alias của lệnh "${commandName}":\n${aliases.join(", ")}`
              : `Lệnh "${commandName}" Không có alias nào`,
        },
        false,
        300000
      );
    } else {
      const aliasInfo = commandConfig.commands
        .filter((cmd) => cmd.alias && cmd.alias.length > 0)
        .map((cmd) => `${cmd.name}: ${cmd.alias.join(", ")}`)
        .join("\n");

      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message: aliasInfo.length > 0 ? `Danh sách alias của các lệnh:\n${aliasInfo}` : "Không có alias nào được cấu hình",
        },
        false,
        300000
      );
    }
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi hiển thị alias: ${error.message}`,
      },
      false,
      300000
    );
  }
}

export async function handleSendMessagePrivate(api, message) {
  const content = removeMention(message);
  const mentions = message.data.mentions;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();

  const parts = content.split("_");

  if (parts.length < 2) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message:
          `Cú pháp Không đúng. Vui lòng sử dụng:\n` +
          `${prefix}sendp_[Nội dung tin nhắn]_[Số lần] @user\n` +
          `hoặc: ${prefix}sendp_[Nội dung tin nhắn]_[Số lần]_[ID người nhận]`,
      },
      false,
      30000
    );
    return;
  }

  try {
    let smsContent = parts[1].trim();

    if (smsContent.length === 0) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không có nội dung tin nhắn!`,
        },
        false,
        30000
      );
      return;
    }

    let repeatCount = 1;
    let userIds = [];

    if (parts.length >= 3) {
      const count = parseInt(parts[2]);
      if (!isNaN(count)) {
        repeatCount = count;
      }
    }

    if (!isAdmin(senderId) && repeatCount > 999) {
      repeatCount = 999;
    }

    if (mentions && Object.keys(mentions).length > 0) {
      userIds = Object.values(mentions).map((mention) => mention.uid);
    } else if (parts.length >= 4) {
      const specificId = parts[3].trim();
      if (specificId) {
        userIds = [specificId];
      }
    } else {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy người nhận!`,
        },
        false,
        30000
      );
      return;
    }

    const userInfo = await getUserInfoData(api, userIds[0]);

    const targetText =
      userIds.length === 1 && userIds[0] === senderId
        ? "bản thân"
        : userIds.length === 1
        ? `người dùng ${userInfo.name}`
        : `${userIds.length} người`;

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã bắt đầu send tin nhắn riêng "${smsContent}" ${repeatCount} lần cho ${targetText}`,
      },
      false,
      30000
    );

    for (const userId of userIds) {
      for (let i = 0; i < repeatCount; i++) {
        try {
          await api.sendSMS(smsContent, userId);
        } catch (error) {
          console.error(`Lỗi khi gửi tin nhắn riêng cho ${userId}:`, error);
          continue;
        }
      }
    }

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã hoàn thành gửi tin nhắn riêng cho ${targetText}`,
      },
      false,
      30000
    );
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi gửi tin nhắn riêng: ${error.message}`,
      },
      false,
      30000
    );
  }
}

export async function handleSendTaskCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const status = content.split(" ")[1]?.toLowerCase();
  const threadId = message.threadId;

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  let newStatus;
  if (status === "on") {
    groupSettings[threadId].sendTask = true;
    newStatus = "bật";
  } else if (status === "off") {
    groupSettings[threadId].sendTask = false;
    newStatus = "tắt";
  } else {
    groupSettings[threadId].sendTask = !groupSettings[threadId].sendTask;
    newStatus = groupSettings[threadId].sendTask ? "bật" : "tắt";
  }

  const caption = `Đã ${newStatus} chức năng gửi nội dung tự động sau mỗi giờ vào nhóm này!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].sendTask, 300000);

  return true;
}

export async function handleTikTokAutoDownloadCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const status = content.split(" ")[1]?.toLowerCase();
  const threadId = message.threadId;

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  let newStatus;
  if (status === "on") {
    groupSettings[threadId].tiktokauto = true;
    newStatus = "bật";
  } else if (status === "off") {
    groupSettings[threadId].tiktokauto = false;
    newStatus = "tắt";
  } else {
    groupSettings[threadId].tiktokauto = !groupSettings[threadId].tiktokauto;
    newStatus = groupSettings[threadId].tiktokauto ? "bật" : "tắt";
  }

  const caption = `Đã ${newStatus} chức năng dowload link tiktok vào nhóm này!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].tiktokauto, 300000);

  return true;
}
// Khai báo biến toàn cục
const sentNumbers = {};
const queue = {};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export async function handleRunPythonCommand(api, message) {
  const content = message.data?.content?.trim() || "";
  const prefix = getGlobalPrefix();
  const senderName = message.data?.dName || "Người dùng";
  const senderId = message.data?.uidFrom;
  const threadId = message.threadId;

  if (!content.startsWith(`${prefix}sms`)) {
    await api.sendMessage(
      {
        msg: `(@${senderName})\nVui lòng nhập đúng cú pháp: ${prefix}sms <số điện thoại>`,
        mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
      },
      threadId,
      message.type
    );
    return;
  }

  const commandParts = content.split(" ").filter(Boolean);
  if (commandParts.length < 2) {
    await api.sendMessage(
      {
        msg: `(@${senderName})\nSai cú pháp! Ví dụ: ${prefix}sms 0987654321`,
        mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
        ttl: 60000
      },
      threadId,
      message.type
    );
    return;
  }

  const phoneNumber = commandParts[1];
  const count = 20;

  try {
    if (!sentNumbers[phoneNumber]) {
      sentNumbers[phoneNumber] = true;
      for (let i = 1; i <= 10; i++) {
        const scriptPath = path.resolve(__dirname, "data", `${i}.py`);
        spawn("python", [scriptPath, phoneNumber, count], { stdio: "inherit" });
      }
      setTimeout(() => {
        delete sentNumbers[phoneNumber]; 
        if (queue[phoneNumber] && queue[phoneNumber].length > 0) {
          const nextCommand = queue[phoneNumber].shift();
          handleRunPythonCommand(api, nextCommand);
        }
      }, 1000);

      await api.sendMessage(
        {
          msg: `(@${senderName})\n📡 SMS Gửi Thành Công!\n📞 Số Điện Thoại: ${phoneNumber}\n📩 Số Lần Gửi: ${count} lần\n✅ Trạng Thái: Thành công`,
          mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
          ttl: 60000
        },
        threadId,
        message.type
      );
    } else {
      if (!queue[phoneNumber]) {
        queue[phoneNumber] = [];
      }
      queue[phoneNumber].push(message);

      await api.sendMessage(
        {
          msg: `(@${senderName})\nSố điện thoại ${phoneNumber} hiện đang được spam. Vui lòng đợi cho đến khi hoàn tất.`,
          mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
          ttl: 60000
        },
        threadId,
        message.type
      );
    }
  } catch (error) {
    console.error(`❌ Lỗi khi gửi SMS: ${error.message}`);
    await api.sendMessage(
      {
        msg: `(@${senderName})\n❌ Lỗi khi gửi SMS: ${error.message}`,
        mentions: [{ uid: senderId, pos: 0, len: senderName.length + 3 }],
      },
      threadId,
      message.type
    );
  }
}
export async function spamCallInGroup(api, message, aliasCommand) {
  try {
    const senderName = message.data?.dName || "Người dùng";
    const senderId = message.data?.uidFrom;
    let mentions = message.data?.mentions || [];

    // Hỗ trợ reply nếu không mention
    if (mentions.length === 0 && message.data?.reply) {
      mentions.push({
        uid: message.data.reply.uid,
        dName: message.data.reply.dName || "Người dùng"
      });
    }

    if (mentions.length === 0) {
      return sendMessageFailed(api, message, `Vui lòng mention hoặc reply người bạn muốn gọi.`);
    }

    const prefix = getGlobalPrefix();
    const rawContent = removeMention(message) || '';
    const content = rawContent.replace(`${prefix}${aliasCommand}`, '').trim();
    const args = content.split(' ');
    const count = parseInt(args[0]);

    if (isNaN(count) || count <= 0) {
      return sendMessageFailed(api, message, `Cú pháp sai. Ví dụ: ${prefix}${aliasCommand} @user 5`);
    }

    const targetUid = String(mentions[0].uid);
    const targetName = mentions[0].dName || "Người dùng";

    // Hàm sleep
    const sleep = (ms) => new Promise(res => setTimeout(res, ms));
    
    for (let i = 0; i < count; i++) {
      try {
        await api.sendCallVoice(targetUid);
        console.log(`📞 Nhá máy ${i + 1}/${count} đến ${targetUid}`);
        if (i < count - 1) await sleep(3000);
      } catch (err) {
        console.error(`❌ Lỗi khi gọi lần ${i + 1}:`, err.message || err);
        break;
      }
    }
    const msg = `@${senderName} Đã dùng bí thuật ${count} lần đến @${targetName}`;
    const mentionList = [
      { uid: senderId, pos: 0, len: senderName.length + 1 },
      { uid: targetUid, pos: msg.indexOf(`@${targetName}`), len: targetName.length + 1 }
    ];

    await api.sendMessage({
      msg,
      mentions: mentionList,
      ttl: 360000,
    }, message.threadId, message.type);

  } catch (err) {
    console.error("❌ Lỗi spam call:", err);
    await sendMessageFailed(api, message, `Lỗi: ${err.message}`);
  }
}

export async function handleGetLinkInQuote(api, message) {
  const quote = message.data.quote;
  if (!quote || !quote.attach) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Không tìm thấy link trong tin nhắn được reply!`,
      },
      false,
      30000
    );
    return;
  }

  try {
    const attachData = JSON.parse(quote.attach);
    
    if (!attachData.href) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy link trong tin nhắn được reply!`,
        },
        false,
        30000
      );
      return;
    }

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Link: ${attachData.href}`,
      },
      false,
      86400000
    );
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Lỗi khi xử lý link: ${error.message}`,
      },
      false,
      30000
    );
  }
}



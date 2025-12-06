import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { getGlobalPrefix } from '../../service-dqt/service.js';
import { sendMessageStateQuote, sendMessageFailed } from '../chat-zalo/chat-style/chat-style.js';
import { nameServer } from '../../database/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const des = {
  name: 'spamff',
  type: 1,
  permission: 'all',
  countdown: 5,
  active: true,
  alias: ['spamff'],
};

// Gộp tag và chữ đỏ vào 1 dòng duy nhất
const getCleanNameServer = () => {
  const lines = nameServer
    .split('\n')
    .map(line => line.trim())
    .filter(line => line);

  const tagLine = lines.find(line => line.startsWith('@'));
  const boldLine = lines.find(line => /\*\*(.*?)\*\*/.test(line) || /__(.*?)__/.test(line));

  return [tagLine, boldLine].filter(Boolean).join(' ');
};

// Gọi API buff like Free Fire
async function buffLike(uid) {
  const apiUrl = `https://spamriquest-byobiiv2.onrender.com/send_requests?uid=${encodeURIComponent(uid)}`;
  console.log('Gọi API:', apiUrl);

  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json'
    }
  });

  return await res.json();
}

export async function handleSpamffCommand(api, message) {
  const threadId = message.threadId;
  const content = message.data.content.trim();
  const currentPrefix = getGlobalPrefix();

  if (!content.startsWith(`${currentPrefix}spamff`)) return false;

  const args = content.slice(currentPrefix.length + 6).trim().split(/\s+/);

  // Yêu cầu đúng 1 tham số (UID)
  if (args.length !== 1) {
    return sendMessageStateQuote(api, message, `${getCleanNameServer()}❌ Sai cú pháp! Dùng: ${currentPrefix}spamff <uid>`, true, 60000, false);
  }

  const uid = args[0];

  if (!/^\d+$/.test(uid)) {
    return sendMessageStateQuote(api, message, `${getCleanNameServer()}❌ UID phải là số!`, true, 60000, false);
  }

  try {
    const result = await buffLike(uid);

    if (!result || result.error) {
      return sendMessageStateQuote(api, message, `${getCleanNameServer()}❌ Không thể spam kết bạn cho UID ${uid}. Lý do: ${result?.error || 'Không rõ'}`, true, 60000, false);
    }

    const { nickname, level, region, status, success_count, failed_count } = result;

    const msg =
`🎮 KẾT QUẢ SPAM KẾT BẠN FREE FIRE

👤 Người Chơi:
➤ Tên: ${nickname}
➤ UID: ${uid}
➤ Khu vực: ${region}
➤ Cấp độ: ${level}
➤ Trạng thái: ${status === 1 ? 'Thành công' : 'Thất bại'}
➤ Số kết bạn đã gửi: ${success_count}
➤ Số thất bại: ${failed_count}

🛠️ Created by: HwH`;

    return sendMessageStateQuote(api, message, `${getCleanNameServer()}${msg}`, true, 1800000, false);

  } catch (e) {
    console.error('Lỗi API Spam FF:', e);
    return sendMessageFailed(api, message, `${getCleanNameServer()}❌ Lỗi khi truy vấn API: ${e.message}`, true);
  }
}
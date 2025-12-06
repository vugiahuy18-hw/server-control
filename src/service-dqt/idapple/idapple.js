import fetch from 'node-fetch';
import { getGlobalPrefix } from '../../service-dqt/service.js';
import {
  sendMessageStateQuote,
  sendMessageFailed
} from '../chat-zalo/chat-style/chat-style.js';
import { nameServer } from '../../database/index.js';

export const des = {
  name: 'idapple',
  type: 1,
  permission: 'all',
  countdown: 5,
  active: true,
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

// Hàm xử lý unescape ký tự đặc biệt
const unescapeString = (str) => {
  return str.replace(/\\u0026/g, '&').replace(/\\u0027/g, "'").replace(/\\u0022/g, '"');
};

export async function handleIdAppleCommand(api, message) {
  const threadId = message.threadId;
  const uid = message.data.uidFrom;
  const content = message.data.content.trim();
  const currentPrefix = getGlobalPrefix();

  if (!content.startsWith(`${currentPrefix}idapple`)) return false;

  const args = content.slice(currentPrefix.length + 7).trim().split(/\s+/);

  // Xử lý lệnh idapple check
  if (args[0] === 'check') {
    try {
      const apiUrl = 'https://idapple.csadata4g.me/backend.php';
      console.log('Gọi API:', apiUrl);

      const res = await fetch(apiUrl);
      const contentType = res.headers.get('content-type');
      console.log('Content-Type:', contentType);

      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.log('Phản hồi không phải JSON:', text.slice(0, 100));
        return sendMessageStateQuote(api, message, `${getCleanNameServer()}❌ API trả về dữ liệu không phải JSON. Vui lòng thử lại sau!`, true, 60000, false);
      }

      const json = await res.json();

      if (!res.ok || json.status !== 'ok' || !json.remaining) {
        return sendMessageStateQuote(api, message, `${getCleanNameServer()}❌ Không thể kiểm tra số lượng tài khoản.`, true, 60000, false);
      }

      const remaining = json.remaining || 0;
      const msg = `📊 Số lượng tài khoản còn lại: ${remaining}\n🕒 Cập nhật: ${json.date || 'N/A'}`;
      return sendMessageStateQuote(api, message, `${getCleanNameServer()}${msg}`, true, 60000, false);

    } catch (e) {
      console.error('Lỗi API idapple check:', e);
      return sendMessageFailed(api, message, `${getCleanNameServer()}❌ Lỗi khi kiểm tra số lượng: ${e.message}`, true);
    }
  }

  // Xử lý lệnh idapple <số lượng>
  if (args.length !== 1 || !/^\d+$/.test(args[0])) {
    return sendMessageStateQuote(api, message, `${getCleanNameServer()}❌ Sai cú pháp! Dùng: ${currentPrefix}idapple check hoặc ${currentPrefix}idapple <số lượng>`, true, 60000, false);
  }

  const requestedAmount = parseInt(args[0], 10);

  if (requestedAmount <= 0) {
    return sendMessageStateQuote(api, message, `${getCleanNameServer()}❌ Số lượng phải lớn hơn 0!`, true, 60000, false);
  }

  try {
    const apiUrl = 'https://idapple.csadata4g.me/backend.php';
    console.log('Gọi API:', apiUrl);

    const res = await fetch(apiUrl);
    const contentType = res.headers.get('content-type');
    console.log('Content-Type:', contentType);

    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      console.log('Phản hồi không phải JSON:', text.slice(0, 100));
      return sendMessageStateQuote(api, message, `${getCleanNameServer()}❌ API trả về dữ liệu không phải JSON. Vui lòng thử lại sau!`, true, 60000, false);
    }

    const json = await res.json();

    if (!res.ok || json.status !== 'ok' || !json.accounts || json.accounts.length === 0) {
      return sendMessageStateQuote(api, message, `${getCleanNameServer()}❌ Không tìm thấy tài khoản nào hoặc số lượng yêu cầu vượt quá giới hạn.`, true, 60000, false);
    }

    // Lọc tài khoản active (status === 1) và lấy số lượng yêu cầu
    const activeAccounts = json.accounts.filter(acc => acc.status === 1);
    if (activeAccounts.length === 0) {
      return sendMessageStateQuote(api, message, `${getCleanNameServer()}❌ Không có tài khoản active nào!`, true, 60000, false);
    }

    const accounts = activeAccounts.slice(0, Math.min(requestedAmount, json.remaining));
    if (accounts.length === 0) {
      return sendMessageStateQuote(api, message, `${getCleanNameServer()}❌ Số lượng yêu cầu vượt quá số lượt còn lại (${json.remaining})!`, true, 60000, false);
    }

    const msg = `📋 Danh sách ID Apple (${accounts.length} tài khoản):\n\n` +
      accounts.map((acc, index) => 
        `➤ ID ${index + 1}: ${unescapeString(acc.username)}\n` +
        `Mật khẩu: ${unescapeString(acc.password)}\n` +
        `Quốc gia: ${acc.DVS_country_name || 'N/A'}\n` +
        `Cập nhật: ${acc.time || 'N/A'}\n` +
        `Trạng thái: ${acc.status === 1 ? 'Active' : 'Không active'}\n`
      ).join('\n') +
      `\n⚠️ Số lượt còn lại: ${json.remaining}\n` +
      `🛠️ Created by: N Q D`;

    return sendMessageStateQuote(api, message, `${getCleanNameServer()}${msg}`, true, 1800000, false);

  } catch (e) {
    console.error('Lỗi API idapple:', e);
    return sendMessageFailed(api, message, `${getCleanNameServer()}❌ Lỗi khi truy vấn API: ${e.message}`, true);
  }
}
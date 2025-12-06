// --- Gửi lịch dạng text ---
export async function sendCalendarText(api, message, inputDate = new Date()) {
    try {
      // Xử lý ngày hiện tại
      const date = inputDate instanceof Date ? inputDate : new Date(inputDate);
  
      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const weekday = date.toLocaleDateString("vi-VN", { weekday: "long" });
      const now = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  
      // Nội dung lịch text
      const calendarText =
  `📅 LỊCH NGÀY HÔM NAY
  ━━━━━━━━━━━━━━━━━━━
  📌 Ngày: ${day}/${month}/${year}
  📌 Thứ: ${weekday}
  ⏰ Giờ hiện tại: ${now}
  
  💡 Chúc bạn một ngày tốt lành!`;
  
      // Lấy recipientId từ message
      const recipientId = message.threadId || message.data?.idTo || message.data?.uidFrom;
      if (!recipientId) {
        console.error("❌ Không tìm thấy recipientId:", message);
        return;
      }
  
      console.log("📨 Gửi lịch (text) tới:", recipientId);
  
      // 🔑 Với Zalo Bot, content phải nằm trong "content"
      await api.sendMessage(
        {
          msgType: "text",
          content: calendarText
        },
        recipientId
      );
  
      console.log("✅ Gửi lịch thành công!");
    } catch (err) {
      console.error("❌ Lỗi gửi lịch (text):", err);
      const recipientId = message.threadId || message.data?.idTo || message.data?.uidFrom;
      if (recipientId) {
        await api.sendMessage(
          {
            msgType: "text",
            content: "⚠️ Không thể gửi lịch!"
          },
          recipientId
        );
      }
    }
  }
  
import { createCanvas } from "canvas";
import fs from "fs";
import path from "path";

export async function createCalendarImage(api, message) {
  try {
    // Lấy ngày hiện tại
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth(); // 0-11
    const date = today.getDate();

    // Tạo canvas
    const width = 800;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Nền
    ctx.fillStyle = "#fdf6e3";
    ctx.fillRect(0, 0, width, height);

    // Tiêu đề tháng
    ctx.fillStyle = "#333";
    ctx.font = "bold 40px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`Tháng ${month + 1} - ${year}`, width / 2, 60);

    // Ngày trong tuần
    const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    days.forEach((d, i) => {
      ctx.fillText(d, 100 + i * 100, 120);
    });

    // Bắt đầu từ ngày 1
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    ctx.font = "22px Arial";
    let x = 100 + firstDay * 100;
    let y = 170;

    for (let d = 1; d <= daysInMonth; d++) {
      if (d === date) {
        // Bôi đỏ ngày hiện tại
        ctx.fillStyle = "#d32f2f";
        ctx.beginPath();
        ctx.arc(x, y - 15, 30, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(d.toString(), x, y);
      } else {
        ctx.fillStyle = "#333";
        ctx.fillText(d.toString(), x, y);
      }

      x += 100;
      if (x > 700) {
        x = 100;
        y += 70;
      }
    }

    // Xuất file
    const filePath = path.join(process.cwd(), "calendar.png");
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(filePath, buffer);

    // Gửi ảnh
    api.sendMessage(
      {
        body: `📅 Lịch tháng ${month + 1}/${year}`,
        attachment: fs.createReadStream(filePath),
      },
      message.threadID,
      () => fs.unlinkSync(filePath) // xoá file sau khi gửi
    );
  } catch (err) {
    console.error("Lỗi tạo lịch:", err);
    api.sendMessage("❌ Có lỗi khi tạo lịch!", message.threadID);
  }
}

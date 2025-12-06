import {
    sendMessageFromSQL,
    sendMessageWarningRequest,
  } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
  import { getGlobalPrefix } from "../../service-dqt/service.js";
  import { removeMention } from "../../utils/format-util.js";
  import { MessageType } from "../../api-zalo/index.js";
  
  
  export async function handleJoinLeaveGroup(api, message) {
    const prefix = getGlobalPrefix();
    const content = removeMention(message);
  
    const commandParts = content.split(" ");
    const linkJoin = commandParts[1];
    const iterations = parseInt(commandParts[2]);
    // ✅ Lấy nội dung từ phần còn lại (từ index 3 trở đi)
    const messageContent = commandParts.slice(3).join(" ").trim();
  
    if (!linkJoin || isNaN(iterations) || iterations < 1) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Cú pháp: ${prefix}spamjoin [link] [số lần] [nội dung (tùy chọn)]\n\nVí dụ:\n${prefix}spamjoin https://zalo.me/g/xxx 5\n${prefix}spamjoin https://zalo.me/g/xxx 5 Hello World`,
        },
        false,
        30000
      );
      return;
    }
  
    let groupInfo = null;
    try {
      groupInfo = await api.getGroupInfoByLink(linkJoin);
    } catch (error) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Link này không tồn tại nhóm/cộng đồng nào!`,
        },
        true,
        30000
      );
      return;
    }
  
    if (!groupInfo) return;
  
    let successfulIterations = 0; 
    let approvalErrors = 0; 
    let otherErrors = 0;
    let messageSentCount = 0;

    try {
      for (let i = 0; i < iterations; i++) {
        let joinedSuccessfully = false; 
        try {
          await api.joinGroup(linkJoin);
          joinedSuccessfully = true;
          //console.log(`Lần ${i + 1}: Tham gia nhóm "${groupInfo.name}" thành công`);
        } catch (error) {
          //console.log(`Lần ${i + 1}: Lỗi khi tham gia nhóm: ${error.message}`);
          if (error.message.includes("Waiting for approve")) {
            approvalErrors++;
            continue; 
          } else if (error.message.includes("đã là thành viên")) {
            joinedSuccessfully = true;
          } else {
            otherErrors++;
            continue; 
          }
        }
        
        if (joinedSuccessfully) {
          // ✅ Nếu có nội dung, gửi tin nhắn ngay sau khi join rồi leave ngay
          if (messageContent) {
            try {
              // Gửi tin nhắn ngay (không delay)
              await api.sendMessage(
                {
                  msg: messageContent,
                  ttl: 60000,
                },
                groupInfo.groupId,
                MessageType.GroupMessage
              );
              messageSentCount++;
              
              // Leave ngay sau khi gửi (không delay)
              await api.leaveGroup(groupInfo.groupId);
              successfulIterations++;
            } catch (error) {
              console.error(`Lần ${i + 1}: Lỗi khi gửi/leave: ${error.message}`);
              // Vẫn thử leave nếu gửi tin nhắn lỗi
              try {
                await api.leaveGroup(groupInfo.groupId);
                successfulIterations++;
              } catch (leaveError) {
                otherErrors++;
              }
            }
          } else {
            // ✅ Không có nội dung, leave ngay (không delay)
            try {
              await api.leaveGroup(groupInfo.groupId);
              successfulIterations++;
            } catch (error) {
              otherErrors++;
            }
          }
        }
        
        // ✅ Không delay giữa các lần lặp để nhanh nhất có thể
      }
      
      let resultMessage = `✅ Hoàn thành ${successfulIterations} lần join và leave nhóm "${groupInfo.name}"!`;
      if (messageContent) {
        resultMessage += `\n📝 Đã gửi tin nhắn "${messageContent}" ${messageSentCount} lần.`;
      }
      if (successfulIterations < iterations) {
        resultMessage += `\n⚠️ Lưu ý: ${iterations - successfulIterations} lần thất bại`;
        if (approvalErrors > 0) {
          resultMessage += `\n   - ${approvalErrors} lần do nhóm yêu cầu duyệt thành viên`;
        }
        if (otherErrors > 0) {
          resultMessage += `\n   - ${otherErrors} lần do lỗi khác`;
        }
      }
      
      await sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message: resultMessage,
        },
        true,
        60000
      );
    } catch (error) {
      console.log(`Lỗi không xác định: ${error.message}`);
      await sendMessageWarningRequest(
        api,
        message,
        {
          caption: `Lỗi không xác định: ${error.message}`,
        },
        60000
      );
    }
  }
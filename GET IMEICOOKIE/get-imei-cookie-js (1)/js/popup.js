// popup.js
window.addEventListener("DOMContentLoaded", function () {
  // Kiểm tra xem script đang chạy trong context của popup hay không
  if (document.querySelector(".button-container") && document.getElementById("refresh-button")) {
    // Thiết lập kết nối port với background script
    const port = chrome.runtime.connect({name: "popup-connection"});
    
    // Yêu cầu dữ liệu từ background script khi popup mở
    chrome.runtime.sendMessage({action: "requestData"}, function(response) {
      console.log("Đã yêu cầu dữ liệu:", response);
    });
    
    // Lắng nghe dữ liệu gửi từ background script
    chrome.runtime.onMessage.addListener(function (request) {
      if (request.action === "IMEIValue" && document.getElementById("imei")) {
        document.getElementById("imei").value = request.imei;
        const parent = document.getElementById("imei").parentElement;
        if (parent && parent.classList) {
          parent.classList.remove("is-disabled");
        }
      } else if (request.action === "CookiesValue" && document.getElementById("cookies")) {
        document.getElementById("cookies").value = request.cookies;
        const parent = document.getElementById("cookies").parentElement;
        if (parent && parent.classList) {
          parent.classList.remove("is-disabled");
        }
      } else if (request.action === "UserAgent" && document.getElementById("user-agent")) {
        document.getElementById("user-agent").value = request.useragent;
        const parent = document.getElementById("user-agent").parentElement;
        if (parent && parent.classList) {
          parent.classList.remove("is-disabled");
        }
      }
    });
    
    // Xử lý nút refresh
    const refreshButton = document.getElementById("refresh-button");
    if (refreshButton) {
      refreshButton.addEventListener("click", function() {
        chrome.runtime.sendMessage({action: "requestData"}, function(response) {
          console.log("Đã refresh dữ liệu:", response);
        });
      });
    }
    
    // Thiết lập copy buttons
    setupCopyButtons();
  }
});

// Hàm thiết lập nút copy
function setupCopyButtons() {
  // Copy IMEI
  const btnCopyImei = document.getElementById("btn-copy-imei");
  if (btnCopyImei) {
    btnCopyImei.addEventListener("click", function() {
      const imei = document.getElementById("imei");
      if (imei) {
        copyToClipboard(imei.value);
        showCopyNotification("IMEI");
      }
    });
  }
  
  // Copy Cookies
  const btnCopyCookies = document.getElementById("btn-copy-cookies");
  if (btnCopyCookies) {
    btnCopyCookies.addEventListener("click", function() {
      const cookies = document.getElementById("cookies");
      if (cookies) {
        copyToClipboard(cookies.value);
        showCopyNotification("Cookies");
      }
    });
  }
  
  // Copy User-Agent
  const btnCopyUa = document.getElementById("btn-copy-ua");
  if (btnCopyUa) {
    btnCopyUa.addEventListener("click", function() {
      const userAgent = document.getElementById("user-agent");
      if (userAgent) {
        copyToClipboard(userAgent.value);
        showCopyNotification("User-Agent");
      }
    });
  }
}

// Hàm copy text vào clipboard
function copyToClipboard(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

// Hiển thị thông báo khi copy thành công
function showCopyNotification(type) {
  // Kiểm tra xem có phần tử thông báo nào đã tồn tại không
  let notification = document.querySelector(".copy-notification");
  if (!notification) {
    notification = document.createElement("div");
    notification.className = "copy-notification";
    notification.style.position = "fixed";
    notification.style.bottom = "20px";
    notification.style.right = "20px";
    notification.style.backgroundColor = "#4CAF50";
    notification.style.color = "white";
    notification.style.padding = "10px 20px";
    notification.style.borderRadius = "5px";
    notification.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
    notification.style.opacity = "0";
    notification.style.transition = "opacity 0.3s ease";
    document.body.appendChild(notification);
  }

  notification.textContent = `${type} đã được sao chép!`;
  notification.style.opacity = "1";

  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 2000);
}
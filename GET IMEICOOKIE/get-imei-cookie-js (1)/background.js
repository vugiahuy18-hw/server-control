// background.js
let popupConnected = false;
let popupPorts = [];

// Lắng nghe khi có kết nối từ popup
chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === "popup-connection") {
    console.log("Popup đã kết nối");
    popupConnected = true;
    popupPorts.push(port);
    
    // Lắng nghe khi popup đóng
    port.onDisconnect.addListener(function() {
      console.log("Popup đã đóng");
      popupPorts = popupPorts.filter(p => p !== port);
      popupConnected = popupPorts.length > 0;
    });
  }
});

// Lưu trữ dữ liệu tạm thời khi không có kết nối
let tempData = {
  imei: null,
  cookies: null,
  userAgent: navigator.userAgent
};

function captureRequests() {
  chrome.webRequest.onBeforeRequest.addListener(function (details) {
      let url = details.url;
      let imeiFound = false;

      // Kiểm tra và xử lý IMEI
      if (url.includes("/api/login/getServerInfo") && url.indexOf("imei=") > -1) {
        let params = new URLSearchParams(new URL(url).search);
        imeiFound = true;
        tempData.imei = params.get("imei");

        // Chỉ gửi nếu popup đang mở
        if (popupConnected) {
          chrome.runtime.sendMessage({ action: "IMEIValue", imei: tempData.imei });
        }
      }

      // Xử lý cookies
      if (imeiFound && url.includes("chat.zalo.me")) {
        chrome.cookies.getAll({ url: url }, function (cookies) {
          let parsedCookies = cookies.map(cookie => {
            // Giữ tất cả thuộc tính cho zpw_sek, chỉ giữ name và value cho các cookie khác
            if (cookie.name === "zpw_sek") {
              return {
                domain: cookie.domain,
                expirationDate: cookie.expirationDate || null, 
                hostOnly: cookie.hostOnly,
                httpOnly: cookie.httpOnly,
                name: cookie.name,
                path: cookie.path,
                sameSite: cookie.sameSite || "no_restriction",
                secure: cookie.secure,
                session: cookie.session,
                storeId: cookie.storeId || "0",
                value: cookie.value
              };
            } else {
              return {
                name: cookie.name,
                value: cookie.value
              };
            }
          });

          // Đóng gói cookies
          const cookiesObject = {
            url: "https://chat.zalo.me",
            cookies: parsedCookies
          };

          tempData.cookies = JSON.stringify(cookiesObject);

          // Chỉ gửi nếu popup đang mở
          if (popupConnected) {
            chrome.runtime.sendMessage({ 
              action: "CookiesValue", 
              cookies: tempData.cookies 
            });
          }
        });
      }

      // Gửi User Agent nếu popup đang mở
      if (popupConnected && !tempData.userAgentSent) {
        chrome.runtime.sendMessage({ 
          action: "UserAgent", 
          useragent: tempData.userAgent 
        });
        tempData.userAgentSent = true;
      }
    },
    { urls: ["<all_urls>"] },
    ["requestBody"]
  );
}

// Lắng nghe yêu cầu dữ liệu từ popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "requestData") {
    // Gửi dữ liệu đã lưu tạm thời khi popup yêu cầu
    if (tempData.imei) {
      chrome.runtime.sendMessage({ action: "IMEIValue", imei: tempData.imei });
    }
    if (tempData.cookies) {
      chrome.runtime.sendMessage({ action: "CookiesValue", cookies: tempData.cookies });
    }
    chrome.runtime.sendMessage({ action: "UserAgent", useragent: tempData.userAgent });
    
    sendResponse({status: "Data sent"});
  }
  return true; // Giữ kênh thông tin mở cho phản hồi bất đồng bộ
});

captureRequests();
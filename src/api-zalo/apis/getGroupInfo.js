import { appContext } from "../context.js";
import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { encodeAES, handleZaloResponse, request, makeURL } from "../utils.js";
import { Zalo } from "../index.js";

// sleep helper
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getGroupInfoFactory(api) {
    const serviceURL = makeURL(`${api.zpwServiceMap.group[0]}/api/group/getmg-v2`, {
        zpw_ver: Zalo.API_VERSION,
        zpw_type: Zalo.API_TYPE,
    });

    /**
     * Get group information
     *
     * @param groupId Group ID or list of group IDs
     *
     * @throws ZaloApiError
     */
    return async function getGroupInfo(groupId, retries = 5) {
        if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent)
            throw new ZaloApiError("Missing required app context fields");
        if (!groupId) throw new ZaloApiError("Missing groupId");
        if (!Array.isArray(groupId)) groupId = [groupId];

        let params = {
            gridVerMap: {},
        };
        for (const id of groupId) {
            params.gridVerMap[id] = 0;
        }
        params.gridVerMap = JSON.stringify(params.gridVerMap);
        const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
        if (!encryptedParams)
            throw new ZaloApiError("Failed to encrypt message");

        for (let i = 0; i < retries; i++) {
            try {
                const response = await request(serviceURL, {
                    method: "POST",
                    body: new URLSearchParams({
                        params: encryptedParams,
                    }),
                });
                const result = await handleZaloResponse(response);
                if (result.error) {
                    // Kiểm tra nếu là lỗi retry limit (code -69) hoặc message chứa "Retry limit"
                    const isRetryLimitError = result.error.code === -69 || 
                                             (result.error.message && result.error.message.includes("Retry limit"));
                    
                    if (isRetryLimitError && i < retries - 1) {
                        // Tính toán delay tăng dần (exponential backoff): 3s, 5s, 8s, 12s, 15s
                        const delay = Math.min(3000 + (i * 2000), 15000);
                        console.warn(`⚠️ Retry limit (code: ${result.error.code}) - thử lại lần ${i + 1}/${retries} sau ${delay/1000}s...`);
                        await sleep(delay);
                        continue; // Thử lại lần tiếp theo
                    }
                    throw new ZaloApiError(result.error.message, result.error.code);
                }

                return result.data; // ✅ thành công thì trả về luôn
            } catch (err) {
                // Kiểm tra nếu là lỗi retry limit (code -69) hoặc message chứa "Retry limit"
                const isRetryLimitError = (err instanceof ZaloApiError && 
                                         (err.code === -69 || 
                                          (err.message && err.message.includes("Retry limit"))));
                
                if (isRetryLimitError && i < retries - 1) {
                    // Tính toán delay tăng dần (exponential backoff): 3s, 5s, 8s, 12s, 15s
                    const delay = Math.min(3000 + (i * 2000), 15000);
                    console.warn(`⚠️ Retry limit (code: ${err.code}) - thử lại lần ${i + 1}/${retries} sau ${delay/1000}s...`);
                    await sleep(delay);
                    continue; // Thử lại lần tiếp theo
                } else {
                    throw err; // Lỗi khác hoặc đã hết số lần retry thì ném ra luôn
                }
            }
        }

        throw new ZaloApiError("Retry limit reached - vẫn không lấy được group info sau nhiều lần thử", -69);
    };
}

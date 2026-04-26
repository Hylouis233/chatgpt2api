import axios, {AxiosError, type AxiosRequestConfig} from "axios";

import webConfig from "@/constants/common-env";
import {clearStoredAuthKey, getStoredAuthKey} from "@/store/auth";

const NEW_API_IMAGE_TOKEN_STORAGE_KEY = "chatgpt2api:newapi_image_token";
const NEW_API_IMAGE_TOKEN_NAME = "chatgpt2api-image-generation";

type RequestConfig = AxiosRequestConfig & {
    redirectOnUnauthorized?: boolean;
};

const request = axios.create({
    baseURL: webConfig.apiUrl.replace(/\/$/, ""),
});

request.interceptors.request.use(async (config) => {
    const nextConfig = {...config};
    const authKey = await getStoredAuthKey();
    const headers = {...(nextConfig.headers || {})} as Record<string, string>;
    if (authKey && !headers.Authorization) {
        headers.Authorization = `Bearer ${authKey}`;
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    nextConfig.headers = headers;
    return nextConfig;
});

request.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<{ detail?: { error?: string }; error?: string; message?: string }>) => {
        const status = error.response?.status;
        const shouldRedirect = (error.config as RequestConfig | undefined)?.redirectOnUnauthorized !== false;
        if (status === 401 && shouldRedirect && typeof window !== "undefined") {
            await clearStoredAuthKey();
            window.location.href = `${webConfig.basePath}/login`;
        }

        const payload = error.response?.data;
        const message =
            payload?.detail?.error ||
            payload?.error ||
            payload?.message ||
            error.message ||
            `请求失败 (${status || 500})`;
        return Promise.reject(new Error(message));
    },
);

type RequestOptions = {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    redirectOnUnauthorized?: boolean;
};

export async function httpRequest<T>(path: string, options: RequestOptions = {}) {
    const {method = "GET", body, headers, redirectOnUnauthorized = true} = options;
    const config: RequestConfig = {
        url: path,
        method,
        data: body,
        headers,
        redirectOnUnauthorized,
    };
    const response = await request.request<T>(config);
    return response.data;
}

type NewApiEnvelope<T> = {
    success: boolean;
    message?: string;
    data: T;
};

type NewApiToken = {
    id: number;
    name: string;
    status: number;
};

type NewApiPage<T> = {
    items?: T[];
};

function getNewApiUserId() {
    if (typeof window === "undefined") {
        return "";
    }
    try {
        const user = JSON.parse(window.localStorage.getItem("user") || "{}");
        return String(user?.id || "").trim();
    } catch {
        return "";
    }
}

function getNewApiHeaders(headers: Record<string, string> = {}) {
    const userId = getNewApiUserId();
    if (!userId) {
        throw new Error("LLL API 登录状态无效，请重新登录");
    }
    return {
        "Cache-Control": "no-store",
        "New-Api-User": userId,
        ...headers,
    };
}

async function newApiDashboardRequest<T>(path: string, options: RequestOptions = {}) {
    const {method = "GET", body, headers} = options;
    const response = await axios.request<NewApiEnvelope<T>>({
        baseURL: "",
        url: path,
        method,
        data: body,
        headers: getNewApiHeaders(headers),
    });
    const payload = response.data;
    if (!payload.success) {
        throw new Error(payload.message || "LLL API 请求失败");
    }
    return payload.data;
}

async function readStoredNewApiImageToken() {
    if (typeof window === "undefined") {
        return "";
    }
    return String(window.localStorage.getItem(NEW_API_IMAGE_TOKEN_STORAGE_KEY) || "").trim();
}

function storeNewApiImageToken(token: string) {
    if (typeof window === "undefined") {
        return;
    }
    const normalizedToken = String(token || "").trim();
    if (normalizedToken) {
        window.localStorage.setItem(NEW_API_IMAGE_TOKEN_STORAGE_KEY, normalizedToken);
    } else {
        window.localStorage.removeItem(NEW_API_IMAGE_TOKEN_STORAGE_KEY);
    }
}

async function findNewApiImageToken() {
    const page = await newApiDashboardRequest<NewApiPage<NewApiToken>>(
        `/api/token/search?keyword=${encodeURIComponent(NEW_API_IMAGE_TOKEN_NAME)}&token=&p=1&size=100`,
    );
    return (page.items || []).find((token) => token.name === NEW_API_IMAGE_TOKEN_NAME && token.status === 1);
}

async function createNewApiImageToken() {
    await newApiDashboardRequest<void>("/api/token/", {
        method: "POST",
        body: {
            name: NEW_API_IMAGE_TOKEN_NAME,
            expired_time: -1,
            remain_quota: 0,
            unlimited_quota: true,
            model_limits_enabled: true,
            model_limits: "gpt-image-1,gpt-image-2",
            group: "vip",
            cross_group_retry: true,
        },
    });
    const token = await findNewApiImageToken();
    if (!token) {
        throw new Error("LLL API 图片令牌创建后未找到");
    }
    return token;
}

async function getNewApiImageToken() {
    const storedToken = await readStoredNewApiImageToken();
    if (storedToken) {
        return storedToken;
    }

    const token = (await findNewApiImageToken()) || (await createNewApiImageToken());
    const tokenKey = await newApiDashboardRequest<{ key: string }>(`/api/token/${token.id}/key`, {
        method: "POST",
    });
    const fullKey = String(tokenKey.key || "").trim();
    if (!fullKey) {
        throw new Error("LLL API 图片令牌为空");
    }
    storeNewApiImageToken(fullKey);
    return fullKey;
}

export async function newApiRelayRequest<T>(path: string, options: RequestOptions = {}, retryOnUnauthorized = true): Promise<T> {
    const {method = "GET", body, headers} = options;
    const token = await getNewApiImageToken();
    try {
        const response = await axios.request<T>({
            baseURL: "",
            url: path,
            method,
            data: body,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(headers || {}),
            },
        });
        return response.data;
    } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status === 401 && retryOnUnauthorized) {
            storeNewApiImageToken("");
            return newApiRelayRequest<T>(path, options, false);
        }
        const payload = axios.isAxiosError(error) ? (error.response?.data as any) : undefined;
        const message =
            payload?.error?.message ||
            payload?.detail?.error ||
            payload?.message ||
            (error instanceof Error ? error.message : "") ||
            `LLL API relay 请求失败 (${status || 500})`;
        throw new Error(message);
    }
}

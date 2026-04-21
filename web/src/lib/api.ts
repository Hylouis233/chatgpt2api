import { httpRequest } from "@/lib/request";

export type AccountType = "Free" | "Plus" | "ProLite" | "Pro" | "Team";
export type AccountStatus = "正常" | "限流" | "异常" | "禁用";
export type ImageModel = "gpt-image-1" | "gpt-image-2";
export type ImageConversationContext = {
  accountId?: string | null;
  upstreamConversationId?: string | null;
  upstreamParentMessageId?: string | null;
};

export type Account = {
  id: string;
  access_token: string;
  type: AccountType;
  status: AccountStatus;
  quota: number;
  imageQuotaUnknown?: boolean;
  email?: string | null;
  user_id?: string | null;
  limits_progress?: Array<{
    feature_name?: string;
    remaining?: number;
    reset_after?: string;
  }>;
  default_model_slug?: string | null;
  restoreAt?: string | null;
  success: number;
  fail: number;
  lastUsedAt: string | null;
};

type AccountListResponse = {
  items: Account[];
};

type AccountMutationResponse = {
  items: Account[];
  added?: number;
  skipped?: number;
  removed?: number;
  refreshed?: number;
  errors?: Array<{ access_token: string; error: string }>;
};

type AccountRefreshResponse = {
  items: Account[];
  refreshed: number;
  errors: Array<{ access_token: string; error: string }>;
};

type AccountUpdateResponse = {
  item: Account;
  items: Account[];
};

export async function login(authKey: string) {
  const normalizedAuthKey = String(authKey || "").trim();
  return httpRequest<{ ok: boolean }>("/auth/login", {
    method: "POST",
    body: {},
    headers: {
      Authorization: `Bearer ${normalizedAuthKey}`,
    },
    redirectOnUnauthorized: false,
  });
}

export async function fetchAccounts() {
  return httpRequest<AccountListResponse>("/api/accounts");
}

export async function createAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "POST",
    body: { tokens },
  });
}

export async function deleteAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "DELETE",
    body: { tokens },
  });
}

export async function refreshAccounts(accessTokens: string[]) {
  return httpRequest<AccountRefreshResponse>("/api/accounts/refresh", {
    method: "POST",
    body: { access_tokens: accessTokens },
  });
}

export async function updateAccount(
  accessToken: string,
  updates: {
    type?: AccountType;
    status?: AccountStatus;
    quota?: number;
  },
) {
  return httpRequest<AccountUpdateResponse>("/api/accounts/update", {
    method: "POST",
    body: {
      access_token: accessToken,
      ...updates,
    },
  });
}

export async function generateImage(prompt: string, model: ImageModel = "gpt-image-2") {
  return httpRequest<{
    created: number;
    data: Array<{ b64_json: string; revised_prompt?: string }>;
    account_id?: string | null;
    upstream_conversation_id?: string | null;
    upstream_parent_message_id?: string | null;
  }>(
    "/v1/images/generations",
    {
      method: "POST",
      body: {
        prompt,
        model,
        n: 1,
        response_format: "b64_json",
      },
    },
  );
}

export async function generateImageWithContext(
  prompt: string,
  model: ImageModel = "gpt-image-2",
  context?: ImageConversationContext,
) {
  return httpRequest<{
    created: number;
    data: Array<{ b64_json: string; revised_prompt?: string }>;
    account_id?: string | null;
    upstream_conversation_id?: string | null;
    upstream_parent_message_id?: string | null;
  }>("/v1/images/generations", {
    method: "POST",
    body: {
      prompt,
      model,
      n: 1,
      response_format: "b64_json",
      account_id: context?.accountId || undefined,
      upstream_conversation_id: context?.upstreamConversationId || undefined,
      upstream_parent_message_id: context?.upstreamParentMessageId || undefined,
    },
  });
}

export async function editImage(image: File, prompt: string, model: ImageModel = "gpt-image-2") {
  const formData = new FormData();
  formData.append("image", image);
  formData.append("prompt", prompt);
  formData.append("model", model);
  formData.append("n", "1");
  formData.append("response_format", "b64_json");

  return httpRequest<{
    created: number;
    data: Array<{ b64_json: string; revised_prompt?: string }>;
    account_id?: string | null;
    upstream_conversation_id?: string | null;
    upstream_parent_message_id?: string | null;
  }>(
    "/v1/images/edits",
    {
      method: "POST",
      body: formData,
    },
  );
}

export async function editImageWithContext(
  image: File,
  prompt: string,
  model: ImageModel = "gpt-image-2",
  context?: ImageConversationContext,
) {
  const formData = new FormData();
  formData.append("image", image);
  formData.append("prompt", prompt);
  formData.append("model", model);
  formData.append("n", "1");
  formData.append("response_format", "b64_json");
  if (context?.accountId) {
    formData.append("account_id", context.accountId);
  }
  if (context?.upstreamConversationId) {
    formData.append("upstream_conversation_id", context.upstreamConversationId);
  }
  if (context?.upstreamParentMessageId) {
    formData.append("upstream_parent_message_id", context.upstreamParentMessageId);
  }

  return httpRequest<{
    created: number;
    data: Array<{ b64_json: string; revised_prompt?: string }>;
    account_id?: string | null;
    upstream_conversation_id?: string | null;
    upstream_parent_message_id?: string | null;
  }>("/v1/images/edits", {
    method: "POST",
    body: formData,
  });
}

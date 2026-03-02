const API_BASE_URL = import.meta.env.VITE_API_URL || "";

interface FetchOptions extends RequestInit {
  timeout?: number;
}

function getErrorMessage(status: number, data: unknown): string {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    if (typeof obj.message === "string" && obj.message.trim()) {
      return obj.message;
    }

    if (typeof obj.detail === "string" && obj.detail.trim()) {
      return obj.detail;
    }

    if (Array.isArray(obj.detail) && obj.detail.length > 0) {
      const first = obj.detail[0];
      if (typeof first === "string" && first.trim()) {
        return first;
      }
      if (first && typeof first === "object") {
        const firstObj = first as Record<string, unknown>;
        const msg = typeof firstObj.msg === "string" ? firstObj.msg : null;
        const loc = Array.isArray(firstObj.loc)
          ? firstObj.loc.map((v) => String(v)).join(".")
          : null;
        if (msg && loc) return `${loc}: ${msg}`;
        if (msg) return msg;
      }
    }
  }
  return `HTTP ${status}`;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { timeout = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new ApiError(
        response.status,
        getErrorMessage(response.status, data),
        data
      );
    }

    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  get: <T>(path: string, options?: FetchOptions) =>
    request<T>(path, { ...options, method: "GET" }),

  post: <T>(path: string, body: unknown, options?: FetchOptions) =>
    request<T>(path, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export { ApiError };

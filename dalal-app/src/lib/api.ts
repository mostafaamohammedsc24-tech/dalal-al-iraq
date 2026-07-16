const DEFAULT_BASE = import.meta.env.PROD
  ? "https://api.dalalaliraqnetwork.online/api"
  : "/api";
const BASE = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");

function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  const token = getToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: headers(options?.headers as Record<string, string>),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "خطأ في الاتصال" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function mediaUrl(path?: string | null): string {
  if (!path) return "";
  if (path.startsWith("/objects/")) return `${BASE}/storage${path}`;
  return path;
}

export async function uploadFile(file: File): Promise<string> {
  const token = getToken();
  const reqRes = await fetch(`${BASE}/storage/uploads/request-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!reqRes.ok) {
    const e = await reqRes.json().catch(() => ({ error: "تعذر رفع الملف" }));
    throw new Error(e.error || "تعذر رفع الملف");
  }
  const { uploadURL, objectPath } = await reqRes.json();
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error("فشل رفع الملف، حاول مرة أخرى");
  return objectPath as string;
}

export function setToken(token: string) {
  localStorage.setItem("auth_token", token);
}

export function clearToken() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("current_user");
}

export function saveUser(user: unknown) {
  localStorage.setItem("current_user", JSON.stringify(user));
}

export function getUser() {
  try {
    const u = localStorage.getItem("current_user");
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

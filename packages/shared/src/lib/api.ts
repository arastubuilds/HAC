import type {
  AuthResponse,
  PostResponse,
  ReplyResponse,
  PaginatedResponse,
  QueryStreamEvent,
  ThreadReview,
} from "../types/api.js";

export type ApiClientOptions = {
  baseUrl: string;
  getToken?: () => string | null | undefined;
  onUnauthorized?: () => void;
};

export class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null | undefined;
  private onUnauthorized: () => void;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.getToken = options.getToken ?? (() => null);
    this.onUnauthorized = options.onUnauthorized ?? (() => {});
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
    const token = this.getToken();
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      this.onUnauthorized();
      throw new Error("Unauthorized");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`${method} ${path} → ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  del<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  login(email: string, password: string): Promise<AuthResponse> {
    return this.post<AuthResponse>("/auth/login", { email, password });
  }

  register(data: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<AuthResponse> {
    return this.post<AuthResponse>("/auth/register", data);
  }

  // ─── Posts ─────────────────────────────────────────────────────────────────

  getPosts(page = 1, pageSize = 20): Promise<PaginatedResponse<PostResponse>> {
    return this.get<{ posts: PostResponse[]; total: number; page: number; limit: number }>(
      `/posts?page=${page}&limit=${pageSize}`
    ).then((raw) => ({
      data: raw.posts,
      total: raw.total,
      page: raw.page,
      pageSize: raw.limit,
    }));
  }

  getPost(postId: string): Promise<PostResponse> {
    return this.get<PostResponse>(`/posts/${postId}`);
  }

  createPost(title: string, content: string): Promise<PostResponse> {
    return this.post<PostResponse>("/posts", { title, content });
  }

  updatePost(postId: string, title: string, content: string): Promise<PostResponse> {
    return this.put<PostResponse>(`/posts/${postId}`, { title, content });
  }

  deletePost(postId: string): Promise<void> {
    return this.del<void>(`/posts/${postId}`);
  }

  // ─── Replies ───────────────────────────────────────────────────────────────

  getReplies(postId: string): Promise<ReplyResponse[]> {
    return this.get<{ replies: ReplyResponse[]; total: number; page: number; limit: number }>(
      `/posts/${postId}/replies`
    ).then((raw) => raw.replies);
  }

  createReply(postId: string, content: string, parentReplyId?: string): Promise<ReplyResponse> {
    return this.post<ReplyResponse>(`/posts/${postId}/replies`, { content, parentReplyId });
  }

  deleteReply(postId: string, replyId: string): Promise<void> {
    return this.del<void>(`/posts/${postId}/replies/${replyId}`);
  }

  // ─── Admin reviews ────────────────────────────────────────────────────────

  getReviews(params?: { status?: string; importRunId?: string; publishDecision?: string }): Promise<ThreadReview[]> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.importRunId) qs.set("importRunId", params.importRunId);
    if (params?.publishDecision) qs.set("publishDecision", params.publishDecision);
    const q = qs.toString();
    return this.get<ThreadReview[]>(`/admin/reviews${q ? `?${q}` : ""}`);
  }

  resolveReview(id: string, decision: "approved" | "rejected", reason: string): Promise<void> {
    return this.patch<void>(`/admin/reviews/${id}`, { decision, reason });
  }

  // ─── Query (SSE streaming) ─────────────────────────────────────────────────

  async *queryStream(message: string): AsyncGenerator<QueryStreamEvent> {
    const res = await fetch(`${this.baseUrl}/query`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ message }),
    });
    if (res.status === 401) {
      this.onUnauthorized();
      throw new Error("Unauthorized");
    }
    if (!res.ok || !res.body) {
      throw new Error(`POST /query → ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const json = line.slice(6).trim();
          if (json) yield JSON.parse(json) as QueryStreamEvent;
        }
      }
    }
  }
}
